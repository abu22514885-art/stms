using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

[ApiController]
[Route("api/loans")]
[Authorize]
public class LoansController(AppDbContext db, PaymentService payments, SaleReader reader,
    CreditService credit, TimeService time, WebPushNotificationService push) : ControllerBase
{
    private bool IsAdmin => User.IsInRole(Roles.Admin);

    // GET api/loans?status=open|overdue|paid|all&search=name-or-phone
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? search,
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        await credit.SyncAsync();
        var today = time.Today();

        var q = db.Sales.AsNoTracking().Where(s => s.IsLoan);
        status = (status ?? "open").ToLowerInvariant();
        if (status == "open") q = q.Where(s => s.Status != SaleStatus.Paid);
        else if (status == "overdue") q = q.Where(s => s.Status != SaleStatus.Paid && s.DueDate != null && s.DueDate < today);
        else if (status == "paid") q = q.Where(s => s.Status == SaleStatus.Paid);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLower();
            q = q.Where(s => s.Customer != null &&
                             (s.Customer.FullName.ToLower().Contains(t) || s.Customer.Phone.Contains(t)
                              || s.InvoiceNo.ToLower().Contains(t)));
        }

        // Most overdue first when looking at overdue loans, otherwise oldest first (as before)
        var ordered = status == "overdue"
            ? q.OrderBy(s => s.DueDate).ThenBy(s => s.Id)
            : q.OrderBy(s => s.CreatedAt).ThenBy(s => s.Id);

        var paged = await ordered
            .Select(s => new
            {
                s.Id,
                s.InvoiceNo,
                s.CreatedAt,
                CustomerName = s.Customer != null ? s.Customer.FullName : "",
                Phone = s.Customer != null ? s.Customer.Phone : "",
                s.Total,
                s.AmountPaid,
                Balance = s.Total - s.AmountPaid,
                s.Status
            }).ToPagedAsync(page, pageSize);

        var infos = await credit.InfosAsync(paged.Items.Select(x => x.Id));
        return Ok(paged.Map(s =>
        {
            var i = infos[s.Id];
            return new
            {
                s.Id,
                s.InvoiceNo,
                s.CreatedAt,
                s.CustomerName,
                s.Phone,
                s.Total,
                s.AmountPaid,
                s.Balance,
                s.Status,
                DueDate = i.DueDate,
                i.OverdueDays,
                CreditStatus = i.Status,
                i.PenaltyDue,
                i.TotalDue
            };
        }));
    }

    // Dashboard numbers. Salespeople get counts only (no money), like the rest of their dashboard.
    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        var s = await credit.SummaryAsync();
        if (IsAdmin) return Ok(s);
        return Ok(new
        {
            s.OpenLoans,
            s.CustomersOwing,
            s.DueSoon,
            s.InGrace,
            s.Overdue,
            s.Restricted,
            s.OverdueCustomers,
            s.RestrictedCustomers
        });
    }

    // Reminders raised by the system that nobody has handled yet
    [HttpGet("reminders")]
    public async Task<IActionResult> Reminders()
    {
        await credit.SyncAsync();
        var rows = await db.LoanReminders.AsNoTracking()
            .Where(r => r.DoneAt == null && db.Sales.Any(s => s.Id == r.SaleId && s.Status != SaleStatus.Paid))
            .OrderByDescending(r => r.DueOffset).ThenBy(r => r.CreatedAt).Take(100)
            .Join(db.Sales, r => r.SaleId, s => s.Id, (r, s) => new
            {
                r.Id,
                r.SaleId,
                r.DueOffset,
                r.CreatedAt,
                s.InvoiceNo,
                Customer = s.Customer != null ? s.Customer.FullName : "",
                Phone = s.Customer != null ? s.Customer.Phone : ""
            }).ToListAsync();
        var infos = await credit.InfosAsync(rows.Select(r => r.SaleId));

        var company = (await db.Settings.AsNoTracking().Where(x => x.Key == "company_name").Select(x => x.Value).FirstOrDefaultAsync()) ?? "us";
        return Ok(rows.Select(r =>
        {
            var i = infos[r.SaleId];
            var when = r.DueOffset < 0 ? $"is due in {-r.DueOffset} day(s)"
                     : r.DueOffset == 0 ? "is due today"
                     : $"is {r.DueOffset} day(s) past its due date";
            var pen = i.PenaltyDue > 0 ? $" (including a penalty of {Fmt.Money(i.PenaltyDue)})" : "";
            var sms = $"Dear {r.Customer}, your payment of {Fmt.Money(i.TotalDue)}{pen} for invoice {r.InvoiceNo} {when}. " +
                      $"Please pay to avoid penalties. Thank you, {company}.";
            return new
            {
                r.Id,
                r.SaleId,
                r.InvoiceNo,
                r.Customer,
                r.Phone,
                r.CreatedAt,
                Kind = r.DueOffset < 0 ? "Before due date" : r.DueOffset == 0 ? "Due today" : "Overdue",
                r.DueOffset,
                i.OverdueDays,
                CreditStatus = i.Status,
                i.TotalDue,
                SmsText = sms
            };
        }));
    }

    [HttpPost("reminders/{id:guid}/done")]
    public async Task<IActionResult> ReminderDone(Guid id)
    {
        var r = await db.LoanReminders.FirstOrDefaultAsync(x => x.Id == id);
        if (r is null) return NotFound();
        if (r.DoneAt is null) { r.DoneAt = DateTime.UtcNow; r.DoneBy = User.UserId(); await db.SaveChangesAsync(); }
        return NoContent();
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var sale = await reader.GetAsync(id, IsAdmin);
        return sale is null || !sale.IsLoan ? NotFound() : Ok(sale);
    }

    // Complete credit picture of one loan: dates, balance, penalty months and every payment
    // with the part that paid the sale and the part that paid penalty.
    [HttpGet("{id:guid}/statement")]
    public async Task<IActionResult> Statement(Guid id)
    {
        await credit.SyncAsync();
        var sale = await db.Sales.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id && s.IsLoan);
        if (sale is null) return NotFound();

        var info = (await credit.InfosAsync(new[] { id }))[id];
        var policy = await credit.PolicyAsync();
        var penalties = await db.LoanPenalties.AsNoTracking().Where(p => p.SaleId == id)
            .OrderBy(p => p.PeriodNo)
            .Select(p => new { p.PeriodNo, p.PeriodStart, p.BalanceBase, p.Rate, p.Amount }).ToListAsync();
        var pays = await db.Payments.AsNoTracking().Where(p => p.SaleId == id).OrderBy(p => p.PaidAt)
            .Select(p => new { p.Id, p.PaidAt, p.Amount, p.PenaltyPortion, ToSale = p.Amount - p.PenaltyPortion }).ToListAsync();

        return Ok(new
        {
            saleId = id,
            sale.InvoiceNo,
            sale.Total,
            sale.AmountPaid,
            info.DueDate,
            info.GraceEnd,
            info.OverdueDays,
            info.DaysToDue,
            info.Status,
            Balance = info.Principal,
            info.PenaltyCharged,
            info.PenaltyPaid,
            info.PenaltyDue,
            info.TotalDue,
            info.NextPenaltyDate,
            policy = new { policy.DueDays, policy.GraceDays, PenaltyRatePercent = policy.PenaltyRate * 100m, policy.BlockDays },
            penalties,
            payments = pays
        });
    }

    // Customer pays (part of) the loan: same procedure as a normal sale payment
    // (cash, or bank/wallet with provider + reference ID + screenshot).
    // A payment settles penalty first, then the sale balance.
    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> Pay(Guid id, PaymentRequest r)
    {
        var sale = await db.Sales.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id && s.IsLoan);
        if (sale is null) return NotFound();

        await credit.SyncAsync(force: true);          // penalty months that have started are charged first
        var info = (await credit.InfosAsync(new[] { id }))[id];
        if (info.TotalDue <= 0) return Conflict(new { message = "This loan is already fully paid." });

        var (built, error) = await payments.BuildAsync(new[] { r }, User.UserId(), true);
        if (error is not null) return BadRequest(new { message = error });

        var pay = built![0];
        if (pay.Amount > info.TotalDue)
            return BadRequest(new { message = $"Amount is more than the amount due ({Fmt.Money(info.TotalDue)})." });

        pay.PenaltyPortion = Math.Min(pay.Amount, info.PenaltyDue);
        pay.SaleId = id;
        db.Payments.Add(pay);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505", ConstraintName: "ux_payments_txref" })
        { return Conflict(new { message = "This transaction reference was already used." }); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "P0001" })
        { return Conflict(new { message = "Amount is more than the remaining balance. Refresh and try again." }); }

        await push.TryNotifyAdminsAsync("Loan payment",
            $"{Fmt.Money(pay.Amount)} ETB received for {sale.InvoiceNo}", "/loans");
        return Ok(await reader.GetAsync(id, IsAdmin));
    }
}