using System.Globalization;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;

namespace StockApi.Services;

// Definitions used everywhere (dashboard and reports):
//  Sales      = total billed (price, plus VAT when the customer took a receipt)
//  Subtotal   = sales before VAT
//  Vat        = VAT charged
//  Collected  = money actually received in the period (cash, transfers, loan repayments)
//  Profit     = sum of quantity x (selling price - cost price), before VAT
public record PeriodStats(string Label, int Transactions, int ItemsSold,
    decimal Subtotal, decimal Vat, decimal Sales, decimal Collected, decimal Profit,
    int LoanSales, decimal LoanAmount);
public record SeriesPoint(string Label, decimal Sales, decimal Collected);
public record TopProduct(string Sku, string Name, int Quantity, decimal Sales, decimal Profit);
public record SalespersonStat(Guid Id, string Name, int Transactions, int ItemsSold, decimal Sales, decimal Profit);
public record MethodStat(string Method, int Payments, decimal Amount);
public record BreakdownRow(string Label, int Transactions, decimal Sales, decimal Collected);

public class StatsService(AppDbContext db, TimeService time)
{
    public static readonly string[] Periods = { "day", "week", "month", "year" };

    // Local calendar range of a period. Weeks start on Monday.
    public (DateOnly From, DateOnly To) LocalRange(string period)
    {
        var today = time.Today();
        switch (period)
        {
            case "week":
                var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
                return (monday, monday.AddDays(6));
            case "month":
                var first = new DateOnly(today.Year, today.Month, 1);
                return (first, first.AddMonths(1).AddDays(-1));
            case "year":
                return (new DateOnly(today.Year, 1, 1), new DateOnly(today.Year, 12, 31));
            default:
                return (today, today);
        }
    }

    public (DateTime StartUtc, DateTime EndUtc) UtcRange(DateOnly from, DateOnly to) =>
        (time.DayRangeUtc(from).StartUtc, time.DayRangeUtc(to).EndUtc);

    public async Task<PeriodStats> StatsAsync(string label, DateTime startUtc, DateTime endUtc)
    {
        var sales = db.Sales.Where(s => s.CreatedAt >= startUtc && s.CreatedAt < endUtc);

        var transactions = await sales.CountAsync();
        var subtotal = await sales.SumAsync(s => (decimal?)s.Subtotal) ?? 0m;
        var vat = await sales.SumAsync(s => (decimal?)s.VatTotal) ?? 0m;
        var total = await sales.SumAsync(s => (decimal?)s.Total) ?? 0m;

        var items = sales.SelectMany(s => s.Items);
        var itemsSold = await items.SumAsync(i => (int?)i.Quantity) ?? 0;
        var profit = await items.SumAsync(i => (decimal?)(i.Quantity * (i.UnitPrice - i.UnitCost))) ?? 0m;

        var collected = await db.Payments
            .Where(p => p.PaidAt >= startUtc && p.PaidAt < endUtc)
            .SumAsync(p => (decimal?)p.Amount) ?? 0m;

        var loans = sales.Where(s => s.IsLoan);
        var loanSales = await loans.CountAsync();
        var loanAmount = await loans.SumAsync(s => (decimal?)s.Total) ?? 0m;

        return new PeriodStats(label, transactions, itemsSold, subtotal, vat, total, collected, profit, loanSales, loanAmount);
    }

    // Chart data for the dashboard: day = 24 hours, week = 7 days, month = each day, year = 12 months
    public async Task<List<SeriesPoint>> SeriesAsync(string period, DateOnly from, DateTime startUtc, DateTime endUtc)
    {
        var n = period switch
        {
            "day" => 24,
            "week" => 7,
            "month" => DateTime.DaysInMonth(from.Year, from.Month),
            _ => 12
        };
        var sales = new decimal[n];
        var collected = new decimal[n];

        int Bucket(DateTime utc)
        {
            var l = time.ToLocal(utc);
            return period switch
            {
                "day" => l.Hour,
                "week" => DateOnly.FromDateTime(l).DayNumber - from.DayNumber,
                "month" => l.Day - 1,
                _ => l.Month - 1
            };
        }

        var saleRows = await db.Sales.AsNoTracking()
            .Where(s => s.CreatedAt >= startUtc && s.CreatedAt < endUtc)
            .Select(s => new { s.CreatedAt, s.Total }).ToListAsync();
        foreach (var s in saleRows)
        {
            var i = Bucket(s.CreatedAt);
            if (i >= 0 && i < n) sales[i] += s.Total;
        }

        var payRows = await db.Payments.AsNoTracking()
            .Where(p => p.PaidAt >= startUtc && p.PaidAt < endUtc)
            .Select(p => new { p.PaidAt, p.Amount }).ToListAsync();
        foreach (var p in payRows)
        {
            var i = Bucket(p.PaidAt);
            if (i >= 0 && i < n) collected[i] += p.Amount;
        }

        var result = new List<SeriesPoint>();
        for (var i = 0; i < n; i++)
        {
            var label = period switch
            {
                "day" => $"{i:00}:00",
                "week" => from.AddDays(i).ToString("ddd dd", CultureInfo.InvariantCulture),
                "month" => (i + 1).ToString(CultureInfo.InvariantCulture),
                _ => CultureInfo.InvariantCulture.DateTimeFormat.GetAbbreviatedMonthName(i + 1)
            };
            result.Add(new SeriesPoint(label, sales[i], collected[i]));
        }
        return result;
    }

    // Report breakdown: one row per day (up to ~2 months), otherwise one row per month
    public async Task<List<BreakdownRow>> BreakdownAsync(DateOnly from, DateOnly to)
    {
        var (startUtc, endUtc) = UtcRange(from, to);
        var daily = to.DayNumber - from.DayNumber <= 62;
        string Key(DateTime utc) =>
            time.ToLocal(utc).ToString(daily ? "yyyy-MM-dd" : "yyyy-MM", CultureInfo.InvariantCulture);

        var map = new SortedDictionary<string, (int Count, decimal Sales, decimal Collected)>();

        var saleRows = await db.Sales.AsNoTracking()
            .Where(s => s.CreatedAt >= startUtc && s.CreatedAt < endUtc)
            .Select(s => new { s.CreatedAt, s.Total }).ToListAsync();
        foreach (var s in saleRows)
        {
            var k = Key(s.CreatedAt);
            map.TryGetValue(k, out var cur);
            map[k] = (cur.Count + 1, cur.Sales + s.Total, cur.Collected);
        }

        var payRows = await db.Payments.AsNoTracking()
            .Where(p => p.PaidAt >= startUtc && p.PaidAt < endUtc)
            .Select(p => new { p.PaidAt, p.Amount }).ToListAsync();
        foreach (var p in payRows)
        {
            var k = Key(p.PaidAt);
            map.TryGetValue(k, out var cur);
            map[k] = (cur.Count, cur.Sales, cur.Collected + p.Amount);
        }

        return map.Select(kv => new BreakdownRow(kv.Key, kv.Value.Count, kv.Value.Sales, kv.Value.Collected)).ToList();
    }

    public async Task<List<TopProduct>> TopProductsAsync(DateTime startUtc, DateTime endUtc, int take = 10)
    {
        var inRange = db.Sales.Where(s => s.CreatedAt >= startUtc && s.CreatedAt < endUtc);
        var lines = db.SaleItems.Join(inRange, i => i.SaleId, s => s.Id,
            (i, s) => new { i.ProductSku, i.ProductName, i.Quantity, i.LineTotal, Profit = i.Quantity * (i.UnitPrice - i.UnitCost) });

        var rows = await lines
            .GroupBy(l => new { l.ProductSku, l.ProductName })
            .Select(g => new
            {
                g.Key.ProductSku, g.Key.ProductName,
                Qty = g.Sum(x => x.Quantity), Sales = g.Sum(x => x.LineTotal), Profit = g.Sum(x => x.Profit)
            })
            .ToListAsync();
        return rows.OrderByDescending(r => r.Sales).Take(take)
            .Select(r => new TopProduct(r.ProductSku, r.ProductName, r.Qty, r.Sales, r.Profit)).ToList();
    }

    public async Task<List<SalespersonStat>> BySalespersonAsync(DateTime startUtc, DateTime endUtc)
    {
        var inRange = db.Sales.Where(s => s.CreatedAt >= startUtc && s.CreatedAt < endUtc);

        var sales = await inRange
            .GroupBy(s => s.SalespersonId)
            .Select(g => new { Id = g.Key, Count = g.Count(), Total = g.Sum(x => x.Total) })
            .ToListAsync();

        var lines = db.SaleItems.Join(inRange, i => i.SaleId, s => s.Id,
            (i, s) => new { s.SalespersonId, i.Quantity, Profit = i.Quantity * (i.UnitPrice - i.UnitCost) });
        var perPerson = await lines
            .GroupBy(l => l.SalespersonId)
            .Select(g => new { Id = g.Key, Items = g.Sum(x => x.Quantity), Profit = g.Sum(x => x.Profit) })
            .ToListAsync();

        var names = await db.Users.AsNoTracking().ToDictionaryAsync(u => u.Id, u => u.FullName);

        return sales.Select(s =>
        {
            var l = perPerson.FirstOrDefault(x => x.Id == s.Id);
            return new SalespersonStat(s.Id, names.GetValueOrDefault(s.Id, "?"), s.Count,
                l?.Items ?? 0, s.Total, l?.Profit ?? 0m);
        }).OrderByDescending(x => x.Sales).ToList();
    }

    public async Task<List<MethodStat>> ByMethodAsync(DateTime startUtc, DateTime endUtc)
    {
        var rows = await db.Payments.AsNoTracking()
            .Where(p => p.PaidAt >= startUtc && p.PaidAt < endUtc)
            .GroupBy(p => new { p.PaymentMethodId, p.PaymentProviderId })
            .Select(g => new { g.Key.PaymentMethodId, g.Key.PaymentProviderId, Count = g.Count(), Amount = g.Sum(x => x.Amount) })
            .ToListAsync();
        var methods = await db.PaymentMethods.AsNoTracking().ToDictionaryAsync(m => m.Id, m => m.Name);
        var providers = await db.PaymentProviders.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Name);

        return rows.Select(r =>
        {
            var m = methods.GetValueOrDefault(r.PaymentMethodId, "?");
            var label = r.PaymentProviderId is int pid ? $"{m} - {providers.GetValueOrDefault(pid, "?")}" : m;
            return new MethodStat(label, r.Count, r.Amount);
        }).OrderByDescending(x => x.Amount).ToList();
    }
}
