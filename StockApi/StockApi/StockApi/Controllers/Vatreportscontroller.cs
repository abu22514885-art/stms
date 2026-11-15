using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

// VAT reports for the tax office (admin only).
//   GET api/reports/vat-summary?from=&to=&format=json|pdf   one row per Ethiopian month
//   GET api/reports/vat-register?from=&to=&format=json|pdf  one row per VAT invoice
// Output VAT = VAT charged on sales that carry VAT (customer asked for a receipt).
[ApiController]
[Route("api/reports")]
[Authorize(Roles = Roles.Admin)]
[EnableRateLimiting("heavy")]
public class VatReportsController(AppDbContext db, TimeService time, ReportPdfService pdf, SettingsService settings) : ControllerBase
{
    private const int RowCap = 5000;
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    private static readonly string[] EtMonths =
        { "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume" };

    private static string M(decimal v) => v.ToString("N2", Inv);
    private static string Day(DateOnly d) => d.ToString("yyyy-MM-dd", Inv);
    private static int FloorDiv(int a, int b) => (int)Math.Floor((double)a / b);

    // Gregorian -> Ethiopian calendar (same rules as the web app)
    private static (int Year, int Month, int Day) ToEthiopian(DateOnly d)
    {
        int a = FloorDiv(14 - d.Month, 12);
        int y2 = d.Year + 4800 - a;
        int m2 = d.Month + 12 * a - 3;
        int jdn = d.Day + FloorDiv(153 * m2 + 2, 5) + 365 * y2 + FloorDiv(y2, 4) - FloorDiv(y2, 100) + FloorDiv(y2, 400) - 32045;
        int r = (jdn - 1723856) % 1461;
        int rr = r < 0 ? r + 1461 : r;
        int n = (rr % 365) + 365 * FloorDiv(rr, 1460);
        int year = 4 * FloorDiv(jdn - 1723856, 1461) + FloorDiv(rr, 365) - FloorDiv(rr, 1460);
        return (year, FloorDiv(n, 30) + 1, (n % 30) + 1);
    }

    private static string EtMonthName(int month) => EtMonths[Math.Clamp(month, 1, 13) - 1];

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

    private string Now() => time.ToLocal(DateTime.UtcNow).ToString("yyyy-MM-dd HH:mm", Inv);

    private async Task<IActionResult> Respond(ReportDoc doc, string? format, string fileName)
    {
        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var company = await settings.GetCompanyAsync();
            return File(pdf.Generate(doc, company), "application/pdf", $"{fileName}.pdf");
        }
        return Ok(doc);
    }

    // ------------------------------------------------------------ monthly VAT summary
    [HttpGet("vat-summary")]
    public async Task<IActionResult> Summary([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? format)
    {
        var r = Range(from, to, out var error);
        if (r is null) return BadRequest(new { message = error });

        var (startUtc, endUtc) = time.RangeUtc(r.Value.From, r.Value.To);
        var sales = await db.Sales.AsNoTracking()
            .Where(s => s.CreatedAt >= startUtc && s.CreatedAt < endUtc)
            .Select(s => new { s.CreatedAt, s.WantsReceipt, s.Subtotal, s.VatTotal, s.Total })
            .ToListAsync();

        var groups = sales
            .GroupBy(x => ToEthiopian(DateOnly.FromDateTime(time.ToLocal(x.CreatedAt))))
            .Select(g => new { Key = (g.Key.Year, g.Key.Month), Items = g.ToList() })
            .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
            .ToList();

        var rows = new List<List<string>>();
        foreach (var g in groups)
        {
            var vat = g.Items.Where(x => x.WantsReceipt).ToList();
            var plain = g.Items.Where(x => !x.WantsReceipt).ToList();
            rows.Add(new List<string>
            {
                $"{EtMonthName(g.Key.Month)} {g.Key.Year}",
                vat.Count.ToString(Inv), M(vat.Sum(x => x.Subtotal)), M(vat.Sum(x => x.VatTotal)), M(vat.Sum(x => x.Total)),
                plain.Count.ToString(Inv), M(plain.Sum(x => x.Total))
            });
        }

        var vatAll = sales.Where(x => x.WantsReceipt).ToList();
        var plainAll = sales.Where(x => !x.WantsReceipt).ToList();

        var table = new ReportSection(null,
            new() { "Ethiopian month", "VAT invoices", "Taxable sales (before VAT)", "Output VAT", "Total with VAT", "Sales without VAT", "Amount without VAT" },
            new() { false, true, true, true, true, true, true },
            new() { 2.2f, 1.2f, 2.2f, 1.6f, 1.8f, 1.5f, 1.8f },
            rows,
            new()
            {
                new("VAT invoices", vatAll.Count.ToString(Inv)),
                new("Taxable sales (before VAT)", M(vatAll.Sum(x => x.Subtotal))),
                new("Output VAT (VAT charged)", M(vatAll.Sum(x => x.VatTotal))),
                new("Input VAT on purchases (not recorded here)", "-"),
                new("Sales without VAT", $"{plainAll.Count.ToString(Inv)} / {M(plainAll.Sum(x => x.Total))}")
            });

        var notes = new List<string>
        {
            "Output VAT is counted on the invoice date, including credit (loan) sales.",
            "VAT paid on your purchases is not recorded in this system. Subtract it (from your supplier invoices) from the Output VAT to get the net VAT payable.",
            "Months are Ethiopian calendar months. Choose the dates of the Ethiopian month you are filing, and confirm the filing period and deadline with the Ministry of Revenues or your accountant.",
            "Sales without VAT (the customer did not ask for a receipt) are shown separately. Ask your accountant whether VAT must be charged on them."
        };

        var doc = new ReportDoc("Monthly VAT Summary", $"{Day(r.Value.From)} to {Day(r.Value.To)}", Now(), true, new() { table }, notes);
        return await Respond(doc, format, $"vat-summary-{r.Value.From:yyyyMMdd}-{r.Value.To:yyyyMMdd}");
    }

    // ------------------------------------------------------------ sales VAT register
    [HttpGet("vat-register")]
    public async Task<IActionResult> Register([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? format)
    {
        var r = Range(from, to, out var error);
        if (r is null) return BadRequest(new { message = error });

        var (startUtc, endUtc) = time.RangeUtc(r.Value.From, r.Value.To);
        var inRange = db.Sales.AsNoTracking().Where(s => s.CreatedAt >= startUtc && s.CreatedAt < endUtc);
        var q = inRange.Where(s => s.WantsReceipt);

        var count = await q.CountAsync();
        var taxable = await q.SumAsync(s => (decimal?)s.Subtotal) ?? 0m;
        var vat = await q.SumAsync(s => (decimal?)s.VatTotal) ?? 0m;
        var total = await q.SumAsync(s => (decimal?)s.Total) ?? 0m;

        var plainQ = inRange.Where(s => !s.WantsReceipt);
        var plainCount = await plainQ.CountAsync();
        var plainTotal = await plainQ.SumAsync(s => (decimal?)s.Total) ?? 0m;

        var list = await q.OrderBy(s => s.CreatedAt).Take(RowCap)
            .Select(s => new
            {
                s.InvoiceNo,
                s.CreatedAt,
                Customer = s.Customer != null ? s.Customer.FullName : null,
                s.Subtotal,
                s.VatTotal,
                s.Total,
                s.Status
            }).ToListAsync();

        var rows = list.Select((x, i) =>
        {
            var local = DateOnly.FromDateTime(time.ToLocal(x.CreatedAt));
            var e = ToEthiopian(local);
            return new List<string>
            {
                (i + 1).ToString(Inv), x.InvoiceNo, time.ToLocal(x.CreatedAt).ToString("yyyy-MM-dd HH:mm", Inv),
                $"{e.Day} {EtMonthName(e.Month)} {e.Year}", x.Customer ?? "",
                M(x.Subtotal), M(x.VatTotal), M(x.Total),
                x.Status == SaleStatus.PartiallyPaid ? "Partially paid" : x.Status
            };
        }).ToList();

        var table = new ReportSection(null,
            new() { "#", "Invoice", "Date", "Ethiopian date", "Customer", "Taxable amount", "VAT", "Total", "Status" },
            new() { true, false, false, false, false, true, true, true, false },
            new() { 0.5f, 2.2f, 1.8f, 2f, 2.2f, 1.6f, 1.2f, 1.5f, 1.4f },
            rows,
            new()
            {
                new("VAT invoices", count.ToString(Inv)),
                new("Taxable amount (before VAT)", M(taxable)),
                new("VAT", M(vat)),
                new("Total with VAT", M(total))
            });

        var notes = new List<string>
        {
            $"Sales without VAT in this period (not in this register): {plainCount.ToString(Inv)} sales, total {M(plainTotal)}.",
            "The customer's TIN is not recorded yet, so only the customer name is shown."
        };
        if (count > RowCap) notes.Add($"Showing the first {RowCap} of {count} invoices. The totals include all of them.");

        var doc = new ReportDoc("Sales VAT Register", $"{Day(r.Value.From)} to {Day(r.Value.To)}", Now(), true, new() { table }, notes);
        return await Respond(doc, format, $"vat-register-{r.Value.From:yyyyMMdd}-{r.Value.To:yyyyMMdd}");
    }
}