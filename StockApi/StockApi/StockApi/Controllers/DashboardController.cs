using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController(AppDbContext db, SessionService sessions, StatsService stats, TimeService time) : ControllerBase
{
    // Salesperson dashboard: NO revenue or money totals anywhere in this response.
    [HttpGet("salesperson")]
    [Authorize(Roles = Roles.Salesperson)]
    public async Task<IActionResult> Salesperson()
    {
        var me = User.UserId();
        var today = await sessions.TodayAsync(me);

        var openLoans = await db.Sales.CountAsync(s => s.IsLoan && s.Status != SaleStatus.Paid);
        var customersOwing = await db.Sales
            .Where(s => s.IsLoan && s.Status != SaleStatus.Paid && s.CustomerId != null)
            .Select(s => s.CustomerId).Distinct().CountAsync();

        var totalProducts = await db.Products.CountAsync();
        var outOfStock = await db.Products.CountAsync(p => p.Quantity <= 0);
        var lowStock = await db.Products.CountAsync(p =>
            p.Quantity > 0 && p.StockedQuantity > 0 && p.Quantity * 4 <= p.StockedQuantity);
        var level = outOfStock > 0 ? StockInfo.Red : lowStock > 0 ? StockInfo.Yellow : StockInfo.Green;

        var (startUtc, endUtc) = time.DayRangeUtc(time.Today());
        var recent = await db.Sales.AsNoTracking()
            .Where(s => s.SalespersonId == me && s.CreatedAt >= startUtc && s.CreatedAt < endUtc)
            .OrderByDescending(s => s.CreatedAt).Take(5)
            .Select(s => new
            {
                s.Id, s.InvoiceNo, s.CreatedAt, s.IsLoan, s.Status,
                ItemCount = s.Items.Sum(i => i.Quantity)
            }).ToListAsync();

        return Ok(new
        {
            session = today,
            loans = new { openCount = openLoans, customersOwing },
            stock = new { totalProducts, lowStock, outOfStock, level },
            recentSales = recent
        });
    }

    // Admin dashboard: everything. period = day | week | month | year (default day)
    // "periods" always holds all four, "selected" holds the detail for the chosen one.
    [HttpGet("admin")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Admin([FromQuery] string? period)
    {
        period = (period ?? "day").ToLowerInvariant();
        if (!StatsService.Periods.Contains(period)) period = "day";

        var periods = new Dictionary<string, PeriodStats>();
        foreach (var p in StatsService.Periods)
        {
            var (f, t) = stats.LocalRange(p);
            var (s, e) = stats.UtcRange(f, t);
            periods[p] = await stats.StatsAsync(p, s, e);
        }

        var (rangeFrom, rangeTo) = stats.LocalRange(period);
        var (startUtc, endUtc) = stats.UtcRange(rangeFrom, rangeTo);
        var selected = new
        {
            period,
            from = rangeFrom.ToString("yyyy-MM-dd"),
            to = rangeTo.ToString("yyyy-MM-dd"),
            stats = periods[period],
            series = await stats.SeriesAsync(period, rangeFrom, startUtc, endUtc),
            topProducts = await stats.TopProductsAsync(startUtc, endUtc),
            bySalesperson = await stats.BySalespersonAsync(startUtc, endUtc),
            byPaymentMethod = await stats.ByMethodAsync(startUtc, endUtc)
        };

        // Stock
        var totalProducts = await db.Products.CountAsync();
        var totalUnits = await db.Products.SumAsync(p => (int?)p.Quantity) ?? 0;
        var stockValue = await db.Products.SumAsync(p => (decimal?)(p.Quantity * p.CostPrice)) ?? 0m;
        var outOfStock = await db.Products.CountAsync(p => p.Quantity <= 0);
        var lowStock = await db.Products.CountAsync(p =>
            p.Quantity > 0 && p.StockedQuantity > 0 && p.Quantity * 4 <= p.StockedQuantity);
        var lowRows = await db.Products.AsNoTracking()
            .Where(p => p.Quantity <= 0 || (p.StockedQuantity > 0 && p.Quantity * 4 <= p.StockedQuantity))
            .OrderBy(p => p.Quantity).Take(10)
            .Select(p => new { p.Id, p.Name, p.Sku, p.Quantity, p.StockedQuantity }).ToListAsync();
        var lowItems = lowRows.Select(p => new
        {
            p.Id, p.Name, p.Sku, p.Quantity, p.StockedQuantity,
            Status = StockInfo.Status(p.Quantity, p.StockedQuantity)
        }).ToList();
        var level = outOfStock > 0 ? StockInfo.Red : lowStock > 0 ? StockInfo.Yellow : StockInfo.Green;

        // Loans owed to the business
        var openLoans = db.Sales.Where(s => s.IsLoan && s.Status != SaleStatus.Paid);
        var loans = new
        {
            openCount = await openLoans.CountAsync(),
            customersOwing = await openLoans.Where(s => s.CustomerId != null).Select(s => s.CustomerId).Distinct().CountAsync(),
            outstanding = await openLoans.SumAsync(s => (decimal?)(s.Total - s.AmountPaid)) ?? 0m
        };

        // Today's sessions (who is selling, who checked out)
        var today = time.Today();
        var todaySessions = await db.SalesSessions.AsNoTracking()
            .Where(s => s.SessionDate == today)
            .Join(db.Users, s => s.SalespersonId, u => u.Id,
                (s, u) => new { s.Id, Salesperson = u.FullName, s.StartedAt, s.CheckedOutAt })
            .OrderBy(x => x.StartedAt).ToListAsync();

        var pendingApprovals = await db.Users.CountAsync(u => u.ApprovalStatus == Approval.Pending);

        return Ok(new
        {
            periods,
            selected,
            stock = new { totalProducts, totalUnits, stockValueAtCost = stockValue, lowStock, outOfStock, level, lowItems },
            loans,
            todaySessions,
            pendingApprovals
        });
    }
}
