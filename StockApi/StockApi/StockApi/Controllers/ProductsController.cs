using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

public record ProductCreate(string Name, int? CategoryId, decimal? CostPrice, decimal Price, int Quantity);
public record ProductUpdate(string Sku, string Name, int? CategoryId, decimal? CostPrice, decimal Price);
public record StockChange(int Quantity, string? Reason);
public record ProductDto(Guid Id, string Sku, string Name, int? CategoryId, string? CategoryName,
    decimal? CostPrice, decimal Price, decimal VatAmount, decimal PriceWithVat,
    int Quantity, int StockedQuantity, string StockStatus);

[ApiController]
[Route("api/products")]
[Authorize]
public class ProductsController(AppDbContext db, VatService vat) : ControllerBase
{
    private bool IsAdmin => User.IsInRole(Roles.Admin);

    // Cost price is hidden from salespeople (it would reveal profit)
    private static ProductDto ToDto(Product p, bool admin) => new(
        p.Id, p.Sku, p.Name, p.CategoryId, p.Category?.Name,
        admin ? p.CostPrice : null, p.Price, p.VatAmount, p.PriceWithVat,
        p.Quantity, p.StockedQuantity, StockInfo.Status(p.Quantity, p.StockedQuantity));

    private static string? Validate(string? sku, string name, decimal price, decimal? cost, int qty = 0, bool requireSku = true)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Product name is required.";
        if (requireSku && string.IsNullOrWhiteSpace(sku)) return "SKU and name are required.";
        if (price < 0 || cost < 0) return "Prices cannot be negative.";
        if (qty < 0) return "Quantity cannot be negative.";
        return null;
    }

    private IActionResult Duplicate() =>
        Conflict(new { message = "A product with this SKU or name already exists." });

    private static string GenerateSku(string name)
    {
        var initials = string.Concat(name.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(word => word.FirstOrDefault(char.IsLetterOrDigit)))
            .ToUpperInvariant();

        return $"{(string.IsNullOrEmpty(initials) ? "P" : initials)}{Random.Shared.Next(100, 1000)}";
    }

    private Task<bool> Exists(string sku, string name, Guid except)
    {
        var s = sku.ToLower();
        var n = name.ToLower();
        return db.Products.AnyAsync(p => p.Id != except && (p.Sku.ToLower() == s || p.Name.ToLower() == n));
    }

    // GET api/products?search=&status=Yellow
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] string? status,
        [FromQuery] bool? inStock, [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var q = db.Products.AsNoTracking().Include(p => p.Category).AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(p => p.Name.ToLower().Contains(s) || p.Sku.ToLower().Contains(s));
        }
        if (inStock == true) q = q.Where(p => p.Quantity > 0);
        // Same rule as StockInfo.Status, written so the database can filter it
        if (status == StockInfo.Red) q = q.Where(p => p.Quantity <= 0);
        else if (status == StockInfo.Yellow) q = q.Where(p => p.Quantity > 0 && p.StockedQuantity > 0 && p.Quantity * 4 <= p.StockedQuantity);
        else if (status == StockInfo.Green) q = q.Where(p => p.Quantity > 0 && !(p.StockedQuantity > 0 && p.Quantity * 4 <= p.StockedQuantity));

        var admin = IsAdmin;
        var result = await q.OrderBy(p => p.Name).ThenBy(p => p.Id).ToPagedAsync(page, pageSize);
        return Ok(result.Map(p => ToDto(p, admin)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var p = await db.Products.AsNoTracking().Include(x => x.Category).FirstOrDefaultAsync(x => x.Id == id);
        return p is null ? NotFound() : Ok(ToDto(p, IsAdmin));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ProductCreate r)
    {
        var error = Validate(null, r.Name, r.Price, r.CostPrice, r.Quantity, requireSku: false);
        if (error != null) return BadRequest(new { message = error });

        var name = r.Name.Trim();
        var sku = GenerateSku(name);
        if (await Exists(sku, name, Guid.Empty)) return Duplicate();

        var (price, vatAmount, withVat) = VatService.Compute(r.Price, await vat.GetRateAsync());
        var p = new Product
        {
            Id = Guid.NewGuid(), Sku = sku, Name = name, CategoryId = r.CategoryId,
            CostPrice = Math.Round(r.CostPrice ?? 0, 2),
            Price = price, VatAmount = vatAmount, PriceWithVat = withVat,
            CreatedBy = User.UserId()
        };
        db.Products.Add(p);

        // Quantity is never set directly: the movement's DB trigger adds it
        if (r.Quantity > 0)
            db.StockMovements.Add(new StockMovement
            { Product = p, ChangeQty = r.Quantity, Reason = "Initial", UserId = User.UserId() });

        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        { return Duplicate(); }

        await db.Entry(p).ReloadAsync();
        await db.Entry(p).Reference(x => x.Category).LoadAsync();
        return CreatedAtAction(nameof(Get), new { id = p.Id }, ToDto(p, IsAdmin));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, ProductUpdate r)
    {
        var error = Validate(r.Sku, r.Name, r.Price, r.CostPrice);
        if (error != null) return BadRequest(new { message = error });

        var p = await db.Products.FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();

        var sku = r.Sku.Trim();
        var name = r.Name.Trim();
        if (await Exists(sku, name, id)) return Duplicate();

        p.Sku = sku;
        p.Name = name;
        p.CategoryId = r.CategoryId;
        if (r.CostPrice.HasValue) p.CostPrice = Math.Round(r.CostPrice.Value, 2);
        (p.Price, p.VatAmount, p.PriceWithVat) = VatService.Compute(r.Price, await vat.GetRateAsync());

        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        { return Duplicate(); }

        await db.Entry(p).Reference(x => x.Category).LoadAsync();
        return Ok(ToDto(p, IsAdmin));
    }

    // Soft delete: sales history keeps pointing at the product
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var p = await db.Products.FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();
        p.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }

    // Add new stock. The stocked level (used for the 25% alert) resets to the new total.
    [HttpPost("{id:guid}/restock")]
    public async Task<IActionResult> Restock(Guid id, StockChange r)
    {
        if (r.Quantity <= 0) return BadRequest(new { message = "Quantity must be greater than 0." });
        var p = await db.Products.Include(x => x.Category).FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();

        db.StockMovements.Add(new StockMovement
        { ProductId = id, ChangeQty = r.Quantity, Reason = "Restock", UserId = User.UserId() });
        await db.SaveChangesAsync();
        await db.Entry(p).ReloadAsync();
        return Ok(ToDto(p, IsAdmin));
    }

    // Correct stock: positive or negative number (Reason: "Damage" or anything else = Adjustment)
    [HttpPost("{id:guid}/adjust")]
    public async Task<IActionResult> Adjust(Guid id, StockChange r)
    {
        if (r.Quantity == 0) return BadRequest(new { message = "Quantity cannot be 0." });
        var p = await db.Products.Include(x => x.Category).FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();

        db.StockMovements.Add(new StockMovement
        {
            ProductId = id, ChangeQty = r.Quantity, UserId = User.UserId(),
            Reason = r.Reason == "Damage" ? "Damage" : "Adjustment"
        });
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23514" })
        { return BadRequest(new { message = "Not enough stock for this adjustment." }); }

        await db.Entry(p).ReloadAsync();
        return Ok(ToDto(p, IsAdmin));
    }
}
