using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StockApi.Services;

namespace StockApi.Controllers;

public record LowStockItem(Guid ProductId, string Name, string Sku, int Quantity, int StockedQuantity,
    string Status, string Message);

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController(Data.AppDbContext db) : ControllerBase
{
    // Bell icon: level = Green (all fine) | Yellow (some low) | Red (something is out of stock)
    [HttpGet("low-stock")]
    public async Task<IActionResult> LowStock()
    {
        var rows = await db.Products.AsNoTracking()
            .Where(p => p.Quantity <= 0 || (p.StockedQuantity > 0 && p.Quantity * 4 <= p.StockedQuantity))
            .Select(p => new { p.Id, p.Name, p.Sku, p.Quantity, p.StockedQuantity })
            .ToListAsync();

        var items = rows
            .Select(p =>
            {
                var status = StockInfo.Status(p.Quantity, p.StockedQuantity);
                var msg = status == StockInfo.Red
                    ? $"{p.Name} is out of stock."
                    : $"{p.Name}: only {p.Quantity} left (stocked {p.StockedQuantity}).";
                return new LowStockItem(p.Id, p.Name, p.Sku, p.Quantity, p.StockedQuantity, status, msg);
            })
            .OrderBy(i => i.Status == StockInfo.Red ? 0 : 1)
            .ThenBy(i => i.Quantity)
            .ToList();

        var level = items.Any(i => i.Status == StockInfo.Red) ? StockInfo.Red
                  : items.Count > 0 ? StockInfo.Yellow : StockInfo.Green;

        return Ok(new { level, count = items.Count, items });
    }
}
