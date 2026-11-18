using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

// Public: what the invoice QR code opens. Shows the items only when the signature in the link is genuine.
// No customer, phone or payment details are ever returned.
[ApiController]
[Route("api/verify")]
[AllowAnonymous]
public class VerifyController(AppDbContext db, IConfiguration cfg, SettingsService settings, TimeService time) : ControllerBase
{
    [HttpGet("{invoiceNo}")]
    public async Task<IActionResult> Verify(string invoiceNo, [FromQuery(Name = "s")] string? sig)
    {
        // The same answer for "no such invoice" and "wrong signature", so nobody can probe invoice numbers
        var invalid = Ok(new { valid = false });

        if (string.IsNullOrWhiteSpace(invoiceNo) || invoiceNo.Length > 40 || string.IsNullOrWhiteSpace(sig) || sig.Length > 64)
            return invalid;

        var sale = await db.Sales.AsNoTracking().Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.InvoiceNo == invoiceNo);
        if (sale is null) return invalid;

        var expected = InvoiceLink.Sign(cfg, sale.InvoiceNo, sale.CreatedAt, sale.Subtotal, sale.VatTotal, sale.Total);
        if (!InvoiceLink.Matches(sig, expected)) return invalid;

        var company = await settings.GetCompanyAsync();
        return Ok(new
        {
            valid = true,
            company = company.Name,
            tin = company.Tin,
            invoiceNo = sale.InvoiceNo,
            date = time.ToLocal(sale.CreatedAt).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
            subtotal = sale.Subtotal,
            vat = sale.VatTotal,
            total = sale.Total,
            hasVat = sale.WantsReceipt && sale.VatTotal > 0,
            items = sale.Items.Select(i => new { name = i.ProductName, quantity = i.Quantity, lineTotal = i.LineTotal })
        });
    }
}