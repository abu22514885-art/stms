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
public class LoansController(AppDbContext db, PaymentService payments, SaleReader reader) : ControllerBase
{
    private bool IsAdmin => User.IsInRole(Roles.Admin);

    // GET api/loans?status=open|paid|all&search=name-or-phone
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? search,
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var q = db.Sales.AsNoTracking().Where(s => s.IsLoan);
        status = (status ?? "open").ToLowerInvariant();
        if (status == "open") q = q.Where(s => s.Status != SaleStatus.Paid);
        else if (status == "paid") q = q.Where(s => s.Status == SaleStatus.Paid);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLower();
            q = q.Where(s => s.Customer != null &&
                             (s.Customer.FullName.ToLower().Contains(t) || s.Customer.Phone.Contains(t)));
        }

        var rows = await q.OrderBy(s => s.CreatedAt).ThenBy(s => s.Id)
            .Select(s => new
            {
                s.Id, s.InvoiceNo, s.CreatedAt,
                CustomerName = s.Customer != null ? s.Customer.FullName : "",
                Phone = s.Customer != null ? s.Customer.Phone : "",
                s.Total, s.AmountPaid, Balance = s.Total - s.AmountPaid, s.Status
            }).ToPagedAsync(page, pageSize);
        return Ok(rows);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var sale = await reader.GetAsync(id, IsAdmin);
        return sale is null || !sale.IsLoan ? NotFound() : Ok(sale);
    }

    // Customer pays (part of) the loan: same procedure as a normal sale payment
    // (cash, or bank/wallet with provider + reference ID + screenshot).
    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> Pay(Guid id, PaymentRequest r)
    {
        var sale = await db.Sales.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id && s.IsLoan);
        if (sale is null) return NotFound();

        var balance = sale.Total - sale.AmountPaid;
        if (balance <= 0) return Conflict(new { message = "This loan is already fully paid." });

        var (built, error) = await payments.BuildAsync(new[] { r }, User.UserId(), true);
        if (error is not null) return BadRequest(new { message = error });

        var pay = built![0];
        if (pay.Amount > balance)
            return BadRequest(new { message = $"Amount is more than the remaining balance ({Fmt.Money(balance)})." });

        pay.SaleId = id;
        db.Payments.Add(pay);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505", ConstraintName: "ux_payments_txref" })
        { return Conflict(new { message = "This transaction reference was already used." }); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "P0001" })
        { return Conflict(new { message = "Amount is more than the remaining balance. Refresh and try again." }); }

        return Ok(await reader.GetAsync(id, IsAdmin));
    }
}
