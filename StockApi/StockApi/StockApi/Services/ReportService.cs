using System.Globalization;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;

namespace StockApi.Services;

// One structure for every report: the screen shows it as tables (JSON), the PDF prints the same thing.
public record ReportTotal(string Label, string Value);
public record ReportSection(string? Heading, List<string> Headers, List<bool> RightAlign,
    List<float> Weights, List<List<string>> Rows, List<ReportTotal> Totals);
public record ReportDoc(string Title, string Subtitle, string Generated, bool Landscape,
    List<ReportSection> Sections, List<string> Notes);

public class ReportService(AppDbContext db, StatsService stats, TimeService time)
{
    private const int RowCap = 5000;
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    private static string M(decimal v) => v.ToString("N2", Inv);
    private static string Day(DateOnly d) => d.ToString("yyyy-MM-dd", Inv);
    private string When(DateTime utc) => time.ToLocal(utc).ToString("yyyy-MM-dd HH:mm", Inv);
    private string Now() => time.ToLocal(DateTime.UtcNow).ToString("yyyy-MM-dd HH:mm", Inv);

    private static string StatusText(string status) =>
        status == SaleStatus.PartiallyPaid ? "Partially paid" : status;

    // ---------------------------------------------------------------- Sales
    public async Task<ReportDoc> SalesAsync(DateOnly from, DateOnly to)
    {
        var (startUtc, endUtc) = stats.UtcRange(from, to);
        var q = db.Sales.AsNoTracking().Where(s => s.CreatedAt >= startUtc && s.CreatedAt < endUtc);

        var count = await q.CountAsync();
        var subtotal = await q.SumAsync(s => (decimal?)s.Subtotal) ?? 0m;
        var vat = await q.SumAsync(s => (decimal?)s.VatTotal) ?? 0m;
        var total = await q.SumAsync(s => (decimal?)s.Total) ?? 0m;
        var paid = await q.SumAsync(s => (decimal?)s.AmountPaid) ?? 0m;

        var rows = await q.OrderBy(s => s.CreatedAt).Take(RowCap)
            .Select(s => new
            {
                s.Id, s.InvoiceNo, s.CreatedAt,
                Salesperson = s.Salesperson!.FullName,
                Customer = s.Customer != null ? s.Customer.FullName : null,
                s.IsLoan, s.WantsReceipt, s.Subtotal, s.VatTotal, s.Total, s.AmountPaid, s.Status,
                Items = s.Items.Sum(i => i.Quantity)
            }).ToListAsync();

        var pays = await db.Payments.AsNoTracking()
            .Where(p => db.Sales.Any(s => s.Id == p.SaleId && s.CreatedAt >= startUtc && s.CreatedAt < endUtc))
            .Select(p => new { p.SaleId, Name = p.PaymentProvider != null ? p.PaymentProvider.Name : p.PaymentMethod!.Name })
            .ToListAsync();
        var paidBy = pays.GroupBy(p => p.SaleId)
            .ToDictionary(g => g.Key, g => string.Join(" + ", g.Select(x => x.Name).Distinct()));

        var table = new ReportSection(null,
            new() { "#", "Invoice", "Date", "Salesperson", "Customer", "Paid by", "Items", "Subtotal", "VAT", "Total", "Paid", "Status" },
            new() { true, false, false, false, false, false, true, true, true, true, true, false },
            new() { 0.5f, 2.2f, 1.8f, 1.8f, 2f, 2f, 0.7f, 1.3f, 1.1f, 1.3f, 1.3f, 1.4f },
            rows.Select((r, i) => new List<string>
            {
                (i + 1).ToString(Inv), r.InvoiceNo, When(r.CreatedAt), r.Salesperson, r.Customer ?? "",
                r.IsLoan && !paidBy.ContainsKey(r.Id) ? "Loan" : paidBy.GetValueOrDefault(r.Id, "-"),
                r.Items.ToString(Inv), M(r.Subtotal), M(r.VatTotal), M(r.Total), M(r.AmountPaid), StatusText(r.Status)
            }).ToList(),
            new()
            {
                new("Number of sales", count.ToString(Inv)),
                new("Subtotal (before VAT)", M(subtotal)),
                new("VAT", M(vat)),
                new("Total sales", M(total)),
                new("Paid on these sales", M(paid)),
                new("Not yet paid (loans)", M(total - paid))
            });

        var notes = new List<string>();
        if (count > RowCap) notes.Add($"Showing the first {RowCap} of {count} sales. The totals include all of them.");
        return new ReportDoc("Sales Report", $"{Day(from)} to {Day(to)}", Now(), true, new() { table }, notes);
    }

    // ---------------------------------------------------------------- Stock
    public async Task<ReportDoc> StockAsync()
    {
        var products = await db.Products.AsNoTracking().Include(p => p.Category).OrderBy(p => p.Name).ToListAsync();

        var rows = products.Select(p => new List<string>
        {
            p.Sku, p.Name, p.Category?.Name ?? "", p.Quantity.ToString(Inv), p.StockedQuantity.ToString(Inv),
            StockInfo.Status(p.Quantity, p.StockedQuantity) switch
            {
                StockInfo.Red => "Out of stock",
                StockInfo.Yellow => "Low",
                _ => "OK"
            },
            M(p.CostPrice), M(p.Price), M(p.PriceWithVat), M(p.Quantity * p.CostPrice)
        }).ToList();

        var table = new ReportSection(null,
            new() { "SKU", "Product", "Category", "In stock", "Stocked", "Status", "Cost", "Price", "Price + VAT", "Stock value (cost)" },
            new() { false, false, false, true, true, false, true, true, true, true },
            new() { 1.4f, 3f, 1.8f, 1f, 1f, 1.2f, 1.1f, 1.1f, 1.2f, 1.6f },
            rows,
            new()
            {
                new("Products", products.Count.ToString(Inv)),
                new("Units in stock", products.Sum(p => p.Quantity).ToString(Inv)),
                new("Low stock (25% or less of stocked)", products.Count(p => StockInfo.Status(p.Quantity, p.StockedQuantity) == StockInfo.Yellow).ToString(Inv)),
                new("Out of stock", products.Count(p => p.Quantity <= 0).ToString(Inv)),
                new("Stock value at cost", M(products.Sum(p => p.Quantity * p.CostPrice))),
                new("Stock value at selling price", M(products.Sum(p => p.Quantity * p.Price)))
            });

        return new ReportDoc("Stock Report", $"As of {Now()}", Now(), true, new() { table }, new());
    }

    // ---------------------------------------------------------------- Loans
    public async Task<ReportDoc> LoansAsync(string status)
    {
        status = (status ?? "open").ToLowerInvariant();
        var q = db.Sales.AsNoTracking().Where(s => s.IsLoan);
        if (status == "open") q = q.Where(s => s.Status != SaleStatus.Paid);
        else if (status == "paid") q = q.Where(s => s.Status == SaleStatus.Paid);

        var loans = await q.OrderBy(s => s.CreatedAt)
            .Select(s => new
            {
                s.InvoiceNo, s.CreatedAt, s.Total, s.AmountPaid, s.Status,
                Name = s.Customer != null ? s.Customer.FullName : "",
                Phone = s.Customer != null ? s.Customer.Phone : ""
            }).ToListAsync();

        var today = time.Today();
        var detail = new ReportSection("Loans",
            new() { "Customer", "Phone", "Invoice", "Date", "Days", "Total", "Paid", "Balance", "Status" },
            new() { false, false, false, false, true, true, true, true, false },
            new() { 2.5f, 1.6f, 2.2f, 1.8f, 0.8f, 1.3f, 1.3f, 1.3f, 1.4f },
            loans.Select(l => new List<string>
            {
                l.Name, l.Phone, l.InvoiceNo, When(l.CreatedAt),
                l.Status == SaleStatus.Paid ? "-" : (today.DayNumber - DateOnly.FromDateTime(time.ToLocal(l.CreatedAt)).DayNumber).ToString(Inv),
                M(l.Total), M(l.AmountPaid), M(l.Total - l.AmountPaid), StatusText(l.Status)
            }).ToList(),
            new()
            {
                new("Loans", loans.Count.ToString(Inv)),
                new("Total lent", M(loans.Sum(l => l.Total))),
                new("Paid back", M(loans.Sum(l => l.AmountPaid))),
                new("Still owed", M(loans.Sum(l => l.Total - l.AmountPaid)))
            });

        var byCustomer = loans.Where(l => l.Total - l.AmountPaid > 0)
            .GroupBy(l => new { l.Name, l.Phone })
            .Select(g => new { g.Key.Name, g.Key.Phone, Count = g.Count(), Owed = g.Sum(x => x.Total - x.AmountPaid) })
            .OrderByDescending(x => x.Owed).ToList();
        var owing = new ReportSection("Who owes the most",
            new() { "Customer", "Phone", "Loans", "Balance" },
            new() { false, false, true, true },
            new() { 3f, 2f, 1f, 1.5f },
            byCustomer.Select(c => new List<string> { c.Name, c.Phone, c.Count.ToString(Inv), M(c.Owed) }).ToList(),
            new());

        var label = status == "paid" ? "Paid loans" : status == "all" ? "All loans" : "Open loans";
        return new ReportDoc("Loans Report", $"{label}, as of {Now()}", Now(), true, new() { detail, owing }, new());
    }

    // ---------------------------------------------------------------- Performance
    public async Task<ReportDoc> PerformanceAsync(DateOnly from, DateOnly to)
    {
        var (startUtc, endUtc) = stats.UtcRange(from, to);
        var s = await stats.StatsAsync("range", startUtc, endUtc);
        var margin = s.Subtotal > 0 ? s.Profit / s.Subtotal * 100m : 0m;
        var average = s.Transactions > 0 ? s.Sales / s.Transactions : 0m;

        var openLoans = db.Sales.Where(x => x.IsLoan && x.Status != SaleStatus.Paid);
        var owed = await openLoans.SumAsync(x => (decimal?)(x.Total - x.AmountPaid)) ?? 0m;
        var owedCount = await openLoans.CountAsync();

        var summary = new ReportSection("Summary",
            new() { "Measure", "Value" },
            new() { false, true },
            new() { 4f, 2f },
            new()
            {
                new() { "Sales before VAT", M(s.Subtotal) },
                new() { "VAT charged", M(s.Vat) },
                new() { "Total sales", M(s.Sales) },
                new() { "Money collected", M(s.Collected) },
                new() { "Gross profit (before VAT)", M(s.Profit) },
                new() { "Profit margin", margin.ToString("0.0", Inv) + "%" },
                new() { "Number of sales", s.Transactions.ToString(Inv) },
                new() { "Items sold", s.ItemsSold.ToString(Inv) },
                new() { "Average sale", M(average) },
                new() { "Loan sales (count / amount)", $"{s.LoanSales} / {M(s.LoanAmount)}" },
                new() { "Loans still owed today (count / amount)", $"{owedCount} / {M(owed)}" }
            },
            new());

        var breakdown = (await stats.BreakdownAsync(from, to));
        var monthly = to.DayNumber - from.DayNumber > 62;
        var perPeriod = new ReportSection(monthly ? "Month by month" : "Day by day",
            new() { monthly ? "Month" : "Date", "Sales", "Total sales", "Money collected" },
            new() { false, true, true, true },
            new() { 2f, 1f, 2f, 2f },
            breakdown.Select(b => new List<string> { b.Label, b.Transactions.ToString(Inv), M(b.Sales), M(b.Collected) }).ToList(),
            new());

        var people = await stats.BySalespersonAsync(startUtc, endUtc);
        var bySales = new ReportSection("By salesperson",
            new() { "Salesperson", "Sales", "Items", "Total sales", "Gross profit" },
            new() { false, true, true, true, true },
            new() { 3f, 1f, 1f, 2f, 2f },
            people.Select(p => new List<string> { p.Name, p.Transactions.ToString(Inv), p.ItemsSold.ToString(Inv), M(p.Sales), M(p.Profit) }).ToList(),
            new());

        var top = await stats.TopProductsAsync(startUtc, endUtc, 15);
        var topTable = new ReportSection("Best selling products",
            new() { "SKU", "Product", "Quantity", "Total sales", "Gross profit" },
            new() { false, false, true, true, true },
            new() { 1.5f, 3.5f, 1f, 2f, 2f },
            top.Select(t => new List<string> { t.Sku, t.Name, t.Quantity.ToString(Inv), M(t.Sales), M(t.Profit) }).ToList(),
            new());

        var methods = await stats.ByMethodAsync(startUtc, endUtc);
        var methodTable = new ReportSection("Money received by payment method",
            new() { "Payment method", "Payments", "Amount" },
            new() { false, true, true },
            new() { 4f, 1f, 2f },
            methods.Select(m => new List<string> { m.Method, m.Payments.ToString(Inv), M(m.Amount) }).ToList(),
            new() { new("Total received", M(methods.Sum(m => m.Amount))) });

        var notes = new List<string>
        {
            "Total sales = what was billed (VAT included when the customer took a receipt). Money collected = cash and transfers received in the period, including loan repayments.",
            "Gross profit = quantity x (selling price - cost price), before VAT."
        };
        return new ReportDoc("Sales Performance Report", $"{Day(from)} to {Day(to)}", Now(), false,
            new() { summary, perPeriod, bySales, topTable, methodTable }, notes);
    }
}
