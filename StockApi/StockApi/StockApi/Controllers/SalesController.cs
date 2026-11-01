using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

public record SaleItemRequest(Guid ProductId, int Quantity);
public record CustomerRequest(string FullName, string Phone);
// WantsReceipt = false -> sold at the price WITHOUT VAT; true -> price WITH VAT (+ receipt).
// IsLoan = true -> Customer is required; Payments may hold an optional first payment.
public record SaleRequest(List<SaleItemRequest> Items, bool WantsReceipt, bool IsLoan,
    CustomerRequest? Customer, List<PaymentRequest>? Payments);

[ApiController]
[Route("api/sales")]
[Authorize]
public class SalesController(AppDbContext db, SessionService sessions, PaymentService payments,
    SaleReader reader, ReceiptPdfService pdf, SettingsService settings, VatService vat,
    TimeService time) : ControllerBase
{
    private bool IsAdmin => User.IsInRole(Roles.Admin);

    private IActionResult Bad(string message) => BadRequest(new { message });

    [HttpPost]
    public async Task<IActionResult> Create(SaleRequest r)
    {
        var userId = User.UserId();

        if (r.Items is null || r.Items.Count == 0) return Bad("Add at least one product.");
        if (r.Items.Any(i => i.Quantity <= 0 || i.Quantity > 100000))
            return Bad("Quantities must be between 1 and 100000.");

        // Same product added twice -> one line
        var wanted = r.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var ids = wanted.Keys.ToList();
        var products = await db.Products.AsNoTracking().Where(p => ids.Contains(p.Id)).ToListAsync();
        if (products.Count != ids.Count) return Bad("A product no longer exists. Refresh the product list.");

        var lacking = products.Where(p => p.Quantity < wanted[p.Id]).ToList();
        if (lacking.Count > 0)
            return Conflict(new
            {
                message = "Not enough stock: " +
                          string.Join("; ", lacking.Select(p => $"{p.Name} (only {p.Quantity} left)"))
            });

        // Loan needs the customer's name and phone
        string? phone = null;
        if (r.IsLoan)
        {
            if (r.Customer is null || string.IsNullOrWhiteSpace(r.Customer.FullName))
                return Bad("Customer full name is required for a loan.");
            phone = PhoneHelper.Normalize(r.Customer.Phone);
            if (phone is null) return Bad("Enter a valid customer phone number.");
        }

        // Prices: before VAT, or after VAT when the customer wants a receipt
        var items = new List<SaleItem>();
        foreach (var p in products)
        {
            var qty = wanted[p.Id];
            var vatLine = r.WantsReceipt ? p.VatAmount * qty : 0m;
            items.Add(new SaleItem
            {
                Id = Guid.NewGuid(), ProductId = p.Id, ProductSku = p.Sku, ProductName = p.Name,
                Quantity = qty, UnitPrice = p.Price, UnitCost = p.CostPrice,
                VatAmount = vatLine, LineTotal = qty * p.Price + vatLine
            });
        }
        var subtotal = items.Sum(i => i.Quantity * i.UnitPrice);
        var vatTotal = items.Sum(i => i.VatAmount);
        var total = subtotal + vatTotal;
        if (total <= 0) return Bad("The sale total must be greater than 0.");

        // Payments
        var pays = new List<Payment>();
        if (r.Payments is { Count: > 0 })
        {
            var (built, error) = await payments.BuildAsync(r.Payments, userId, false);
            if (error is not null) return Bad(error);
            pays = built!;
        }
        var paid = pays.Sum(p => p.Amount);
        if (!r.IsLoan && paid == 0) return Bad("Choose how the customer paid, or mark the sale as a loan.");
        if (!r.IsLoan && paid != total)
            return Bad($"Payments ({Fmt.Money(paid)}) must equal the total ({Fmt.Money(total)}).");
        if (r.IsLoan && paid >= total)
            return Bad("A loan must leave a balance. If the customer paid everything, turn off Loan.");

        var (session, sessionError) = await sessions.GetForSellingAsync(userId);
        if (session is null) return Conflict(new { message = sessionError });

        Customer? customer = null;
        if (r.IsLoan)
        {
            customer = await db.Customers.FirstOrDefaultAsync(c => c.Phone == phone);
            if (customer is null)
            {
                customer = new Customer { Id = Guid.NewGuid(), FullName = r.Customer!.FullName.Trim(), Phone = phone! };
                db.Customers.Add(customer);
            }
        }

        // Cash and e-payments are saved with status Loan / paid 0; the payment trigger in the
        // database then updates amount_paid and status (Paid / PartiallyPaid).
        var sale = new Sale
        {
            Id = Guid.NewGuid(), SessionId = session.Id, SalespersonId = userId, Customer = customer,
            WantsReceipt = r.WantsReceipt, IsLoan = r.IsLoan,
            Subtotal = subtotal, VatTotal = vatTotal, Total = total,
            AmountPaid = 0, Status = SaleStatus.Loan
        };
        foreach (var item in items)
        {
            item.SaleId = sale.Id;
            sale.Items.Add(item);
            // Stock is changed only through the ledger; the database trigger updates products.quantity
            db.StockMovements.Add(new StockMovement
            {
                ProductId = item.ProductId, ChangeQty = -item.Quantity, Reason = "Sale",
                SaleId = sale.Id, SaleItemId = item.Id, UserId = userId
            });
        }
        foreach (var pay in pays)
        {
            pay.SaleId = sale.Id;
            sale.Payments.Add(pay);
        }
        db.Sales.Add(sale);

        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505", ConstraintName: "ux_payments_txref" })
        { return Conflict(new { message = "This transaction reference was already used." }); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23514" } pg
                                           && (pg.ConstraintName ?? "").Contains("quantity"))
        { return Conflict(new { message = "Not enough stock. Someone just sold the last items. Refresh and try again." }); }

        var dto = await reader.GetAsync(sale.Id, IsAdmin);
        return CreatedAtAction(nameof(Get), new { id = sale.Id }, new { sale = dto, receiptUrl = $"/api/sales/{sale.Id}/receipt" });
    }

    // Admin: everything, with filters. Salesperson: own sales of today, without money amounts.
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] string? status, [FromQuery] Guid? salespersonId, [FromQuery] bool? isLoan,
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var q = db.Sales.AsNoTracking().AsQueryable();

        if (IsAdmin)
        {
            if (from.HasValue)
            {
                var fromUtc = time.DayRangeUtc(DateOnly.FromDateTime(from.Value)).StartUtc;
                q = q.Where(s => s.CreatedAt >= fromUtc);
            }
            if (to.HasValue)
            {
                var toUtc = time.DayRangeUtc(DateOnly.FromDateTime(to.Value)).EndUtc;
                q = q.Where(s => s.CreatedAt < toUtc);
            }
            if (salespersonId.HasValue) q = q.Where(s => s.SalespersonId == salespersonId);
        }
        else
        {
            var (startUtc, endUtc) = time.DayRangeUtc(time.Today());
            var me = User.UserId();
            q = q.Where(s => s.SalespersonId == me && s.CreatedAt >= startUtc && s.CreatedAt < endUtc);
        }
        if (!string.IsNullOrEmpty(status)) q = q.Where(s => s.Status == status);
        if (isLoan.HasValue) q = q.Where(s => s.IsLoan == isLoan);

        var rows = await q.OrderByDescending(s => s.CreatedAt).ThenBy(s => s.Id)
            .Select(s => new
            {
                s.Id, s.InvoiceNo, s.CreatedAt,
                Salesperson = s.Salesperson!.FullName,
                Customer = s.Customer != null ? s.Customer.FullName : null,
                s.IsLoan, s.WantsReceipt, s.Status,
                ItemCount = s.Items.Sum(i => i.Quantity),
                s.Total, s.AmountPaid
            }).ToPagedAsync(page, pageSize);

        var admin = IsAdmin;
        return Ok(rows.Map(s => new
        {
            s.Id, s.InvoiceNo, s.CreatedAt, s.Salesperson, s.Customer, s.IsLoan, s.WantsReceipt, s.Status, s.ItemCount,
            Total = admin ? (decimal?)s.Total : null,
            AmountPaid = admin ? (decimal?)s.AmountPaid : null
        }));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var sale = await reader.GetAsync(id, IsAdmin);
        if (sale is null) return NotFound();
        if (!IsAdmin && sale.SalespersonId != User.UserId()) return Forbid();
        return Ok(sale);
    }

    // Printable PDF for the customer
    [HttpGet("{id:guid}/receipt")]
    public async Task<IActionResult> Receipt(Guid id)
    {
        var sale = await reader.GetAsync(id, false);
        if (sale is null) return NotFound();
        if (!IsAdmin && sale.SalespersonId != User.UserId()) return Forbid();

        var company = await settings.GetCompanyAsync();
        var rate = await vat.GetRateAsync() * 100m;
        var bytes = pdf.Generate(sale, company, rate);
        return File(bytes, "application/pdf", $"{sale.InvoiceNo}.pdf");
    }
}
