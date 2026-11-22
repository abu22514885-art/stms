using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

// Credit reports (admin only), same ReportDoc format as every other report:
//   GET api/reports/credit-outstanding           open loans with balance, penalty and total due
//   GET api/reports/credit-overdue               customers who are past their due date
//   GET api/reports/credit-collections?from=&to= loan payments received (sale part and penalty part)
//   GET api/reports/credit-penalties?from=&to=   penalties charged and collected
// Add &format=pdf for the printable file.
[ApiController]
[Route("api/reports")]
[Authorize(Roles = Roles.Admin)]
[EnableRateLimiting("heavy")]
public class CreditReportsController(AppDbContext db, CreditService credit, TimeService time,
    ReportPdfService pdf, SettingsService settings) : ControllerBase
{
    private const int RowCap = 5000;
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    private static string M(decimal v) => v.ToString("N2", Inv);
    private static string D(DateOnly? d) => d is null ? "-" : d.Value.ToString("yyyy-MM-dd", Inv);
    private string Now() => time.ToLocal(DateTime.UtcNow).ToString("yyyy-MM-dd HH:mm", Inv);
    private string When(DateTime utc) => time.ToLocal(utc).ToString("yyyy-MM-dd HH:mm", Inv);

    private (DateOnly From, DateOnly To)? Range(DateTime? from, DateTime? to, out string? error)
    {
        error = null;
        var today = time.Today();
        var f = from.HasValue ? DateOnly.FromDateTime(from.Value) : new DateOnly(today.Year, today.Month, 1);
        var t = to.HasValue ? DateOnly.FromDateTime(to.Value) : today;
        if (t < f) { error = "The end date is before the start date."; return null; }
        if (t.DayNumber - f.DayNumber > 366 * 5) { error = "Choose a range of 5 years or less."; return null; }
        return (f, t);
    }

    private async Task<IActionResult> Respond(ReportDoc doc, string? format, string fileName)
    {
        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var company = await settings.GetCompanyAsync();
            return File(pdf.Generate(doc, company), "application/pdf", $"{fileName}.pdf");
        }
        return Ok(doc);
    }

    private record OpenLoan(Guid Id, string InvoiceNo, DateTime CreatedAt, decimal Total, decimal AmountPaid,
        Guid? CustomerId, string Name, string Phone);

    private async Task<(List<OpenLoan> Loans, Dictionary<Guid, CreditInfo> Infos)> OpenLoansAsync()
    {
        await credit.SyncAsync(force: true);
        var loans = await db.Sales.AsNoTracking().Where(s => s.IsLoan && s.Status != SaleStatus.Paid)
            .OrderBy(s => s.DueDate).ThenBy(s => s.CreatedAt).Take(RowCap)
            .Select(s => new OpenLoan(s.Id, s.InvoiceNo, s.CreatedAt, s.Total, s.AmountPaid, s.CustomerId,
                s.Customer != null ? s.Customer.FullName : "", s.Customer != null ? s.Customer.Phone : "")).ToListAsync();
        return (loans, await credit.InfosAsync(loans.Select(l => l.Id)));
    }

    // ------------------------------------------------------------ outstanding loans
    [HttpGet("credit-outstanding")]
    public async Task<IActionResult> Outstanding([FromQuery] string? format)
    {
        var (loans, infos) = await OpenLoansAsync();
        var rows = loans.Select(l =>
        {
            var i = infos[l.Id];
            return new List<string> { l.Name, l.Phone, l.InvoiceNo, When(l.CreatedAt), D(i.DueDate),
                i.OverdueDays.ToString(Inv), i.Status, M(l.Total), M(l.AmountPaid), M(i.Principal), M(i.PenaltyDue), M(i.TotalDue) };
        }).ToList();

        var sec = new ReportSection("Outstanding loans",
            new() { "Customer", "Phone", "Invoice", "Sale date", "Due date", "Days late", "Status", "Total", "Paid", "Balance", "Penalty", "Total due" },
            new() { false, false, false, false, false, true, false, true, true, true, true, true },
            new() { 2.2f, 1.5f, 2.2f, 1.7f, 1.5f, 0.8f, 1.5f, 1.2f, 1.2f, 1.2f, 1.1f, 1.3f },
            rows,
            new()
            {
                new("Open loans", loans.Count.ToString(Inv)),
                new("Sale balance", M(infos.Values.Sum(i => i.Principal))),
                new("Penalty owed", M(infos.Values.Sum(i => i.PenaltyDue))),
                new("Total due", M(infos.Values.Sum(i => i.TotalDue)))
            });
        var doc = new ReportDoc("Outstanding Loans Report", $"As of {Now()}", Now(), true, new() { sec }, new());
        return await Respond(doc, format, "credit-outstanding");
    }

    // ------------------------------------------------------------ overdue customers
    [HttpGet("credit-overdue")]
    public async Task<IActionResult> OverdueCustomers([FromQuery] string? format)
    {
        var (loans, infos) = await OpenLoansAsync();
        var policy = await credit.PolicyAsync();
        var groups = loans.Where(l => infos[l.Id].OverdueDays > 0)
            .GroupBy(l => new { l.CustomerId, l.Name, l.Phone })
            .Select(g => new
            {
                g.Key.Name,
                g.Key.Phone,
                Count = g.Count(),
                Worst = g.Max(x => infos[x.Id].OverdueDays),
                Balance = g.Sum(x => infos[x.Id].Principal),
                Penalty = g.Sum(x => infos[x.Id].PenaltyDue),
                Due = g.Sum(x => infos[x.Id].TotalDue)
            }).OrderByDescending(x => x.Worst).ThenByDescending(x => x.Due).ToList();

        var sec = new ReportSection("Overdue customers",
            new() { "Customer", "Phone", "Overdue loans", "Oldest (days late)", "Balance", "Penalty", "Total due", "Account" },
            new() { false, false, true, true, true, true, true, false },
            new() { 2.6f, 1.6f, 1f, 1.2f, 1.3f, 1.2f, 1.4f, 1.6f },
            groups.Select(g => new List<string>
            {
                g.Name, g.Phone, g.Count.ToString(Inv), g.Worst.ToString(Inv), M(g.Balance), M(g.Penalty), M(g.Due),
                g.Worst >= policy.BlockDays ? "Credit blocked" : g.Worst > policy.GraceDays ? "Overdue" : "Grace period"
            }).ToList(),
            new()
            {
                new("Customers", groups.Count.ToString(Inv)),
                new("Credit blocked", groups.Count(g => g.Worst >= policy.BlockDays).ToString(Inv)),
                new("Total overdue", M(groups.Sum(g => g.Due)))
            });
        var notes = new List<string>
        {
            $"Due date = sale date + {policy.DueDays} days. Penalty {policy.PenaltyRate * 100:0.##}% a month starts after {policy.GraceDays} grace days. " +
            $"Credit is blocked at {policy.BlockDays} days overdue."
        };
        var doc = new ReportDoc("Overdue Customers Report", $"As of {Now()}", Now(), false, new() { sec }, notes);
        return await Respond(doc, format, "credit-overdue");
    }

    // ------------------------------------------------------------ collected payments
    [HttpGet("credit-collections")]
    public async Task<IActionResult> Collections([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? format)
    {
        var r = Range(from, to, out var error);
        if (r is null) return BadRequest(new { message = error });
        var (s, e) = time.RangeUtc(r.Value.From, r.Value.To);

        var pays = await db.Payments.AsNoTracking()
            .Where(p => p.IsLoanRepayment && p.PaidAt >= s && p.PaidAt < e)
            .OrderBy(p => p.PaidAt).Take(RowCap)
            .Select(p => new
            {
                p.PaidAt,
                p.Amount,
                p.PenaltyPortion,
                p.TransactionRef,
                Method = p.PaymentProvider != null ? p.PaymentProvider.Name : p.PaymentMethod!.Name,
                Invoice = db.Sales.Where(x => x.Id == p.SaleId).Select(x => x.InvoiceNo).FirstOrDefault(),
                Customer = db.Sales.Where(x => x.Id == p.SaleId && x.Customer != null).Select(x => x.Customer!.FullName).FirstOrDefault(),
                By = db.Users.Where(u => u.Id == p.ReceivedBy).Select(u => u.FullName).FirstOrDefault()
            }).ToListAsync();

        var sec = new ReportSection("Loan payments received",
            new() { "Date", "Customer", "Invoice", "Method", "Reference", "Received by", "Paid", "To sale", "To penalty" },
            new() { false, false, false, false, false, false, true, true, true },
            new() { 1.8f, 2.3f, 2.2f, 1.6f, 1.6f, 1.8f, 1.2f, 1.2f, 1.2f },
            pays.Select(p => new List<string>
            {
                When(p.PaidAt), p.Customer ?? "", p.Invoice ?? "", p.Method ?? "", p.TransactionRef ?? "", p.By ?? "",
                M(p.Amount), M(p.Amount - p.PenaltyPortion), M(p.PenaltyPortion)
            }).ToList(),
            new()
            {
                new("Payments", pays.Count.ToString(Inv)),
                new("Total collected", M(pays.Sum(p => p.Amount))),
                new("Of which sale balance", M(pays.Sum(p => p.Amount - p.PenaltyPortion))),
                new("Of which penalty", M(pays.Sum(p => p.PenaltyPortion)))
            });
        var doc = new ReportDoc("Collected Loan Payments", $"{r.Value.From:yyyy-MM-dd} to {r.Value.To:yyyy-MM-dd}", Now(), true, new() { sec }, new());
        return await Respond(doc, format, $"credit-collections-{r.Value.From:yyyyMMdd}-{r.Value.To:yyyyMMdd}");
    }

    // ------------------------------------------------------------ penalties
    [HttpGet("credit-penalties")]
    public async Task<IActionResult> Penalties([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? format)
    {
        var r = Range(from, to, out var error);
        if (r is null) return BadRequest(new { message = error });
        await credit.SyncAsync(force: true);
        var (s, e) = time.RangeUtc(r.Value.From, r.Value.To);

        var rows = await db.LoanPenalties.AsNoTracking()
            .Where(p => p.PeriodStart >= r.Value.From && p.PeriodStart <= r.Value.To)
            .OrderBy(p => p.PeriodStart).ThenBy(p => p.SaleId).Take(RowCap)
            .Select(p => new
            {
                p.PeriodStart,
                p.PeriodNo,
                p.BalanceBase,
                p.Rate,
                p.Amount,
                Invoice = db.Sales.Where(x => x.Id == p.SaleId).Select(x => x.InvoiceNo).FirstOrDefault(),
                Customer = db.Sales.Where(x => x.Id == p.SaleId && x.Customer != null).Select(x => x.Customer!.FullName).FirstOrDefault()
            }).ToListAsync();

        var collected = await db.Payments.AsNoTracking()
            .Where(p => p.PaidAt >= s && p.PaidAt < e && p.PenaltyPortion > 0)
            .SumAsync(p => (decimal?)p.PenaltyPortion) ?? 0m;
        var allCharged = await db.LoanPenalties.AsNoTracking().SumAsync(p => (decimal?)p.Amount) ?? 0m;
        var allPaid = await db.Payments.AsNoTracking().SumAsync(p => (decimal?)p.PenaltyPortion) ?? 0m;

        var sec = new ReportSection("Penalties charged",
            new() { "Penalty date", "Customer", "Invoice", "Month no.", "Balance charged on", "Rate %", "Penalty" },
            new() { false, false, false, true, true, true, true },
            new() { 1.6f, 2.6f, 2.3f, 0.9f, 1.6f, 0.9f, 1.3f },
            rows.Select(p => new List<string>
            {
                D(p.PeriodStart), p.Customer ?? "", p.Invoice ?? "", p.PeriodNo.ToString(Inv), M(p.BalanceBase),
                (p.Rate * 100m).ToString("0.##", Inv), M(p.Amount)
            }).ToList(),
            new()
            {
                new("Penalties charged in this period", M(rows.Sum(p => p.Amount))),
                new("Penalties collected in this period", M(collected)),
                new("Penalties still unpaid (all time)", M(allCharged - allPaid))
            });
        var doc = new ReportDoc("Penalties Report", $"{r.Value.From:yyyy-MM-dd} to {r.Value.To:yyyy-MM-dd}", Now(), false, new() { sec }, new());
        return await Respond(doc, format, $"credit-penalties-{r.Value.From:yyyyMMdd}-{r.Value.To:yyyyMMdd}");
    }
}