using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockApi.Data;

namespace StockApi.Controllers;

public record ProviderRequest(int PaymentMethodId, string Name, bool IsActive = true);

[ApiController]
[Route("api/payment-methods")]
[Authorize]
public class PaymentConfigController(AppDbContext db) : ControllerBase
{
    // Everyone: methods with their providers (non-admins only see active ones)
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var admin = User.IsInRole(Roles.Admin);
        var methods = await db.PaymentMethods.AsNoTracking()
            .Where(m => admin || m.IsActive)
            .OrderBy(m => m.Id)
            .Select(m => new
            {
                m.Id, m.Name, m.Type, m.IsActive,
                RequiresProof = m.Type != "Cash",   // reference id + receipt screenshot
                Providers = m.Providers.Where(p => admin || p.IsActive)
                    .OrderBy(p => p.Name)
                    .Select(p => new { p.Id, p.Name, p.IsActive })
                    .ToList()
            }).ToListAsync();
        return Ok(methods);
    }

    [HttpPost("providers")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> AddProvider(ProviderRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return BadRequest(new { message = "Name is required." });
        var m = await db.PaymentMethods.FirstOrDefaultAsync(x => x.Id == r.PaymentMethodId);
        if (m is null || m.Type == "Cash")
            return BadRequest(new { message = "Choose Mobile Banking or Wallet." });

        var p = new PaymentProvider { PaymentMethodId = m.Id, Name = r.Name.Trim(), IsActive = r.IsActive };
        db.PaymentProviders.Add(p);
        return await Save(() => Ok(new { p.Id, p.Name, p.IsActive }));
    }

    [HttpPut("providers/{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> UpdateProvider(int id, ProviderRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return BadRequest(new { message = "Name is required." });
        var p = await db.PaymentProviders.FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();

        p.Name = r.Name.Trim();
        p.IsActive = r.IsActive;
        return await Save(() => Ok(new { p.Id, p.Name, p.IsActive }));
    }

    [HttpDelete("providers/{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteProvider(int id)
    {
        var p = await db.PaymentProviders.FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();
        db.PaymentProviders.Remove(p);
        return await Save(NoContent);
    }

    private async Task<IActionResult> Save(Func<IActionResult> ok)
    {
        try { await db.SaveChangesAsync(); return ok(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        { return Conflict(new { message = "That provider already exists for this payment method." }); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23503" })
        { return Conflict(new { message = "This provider is used by payments. Deactivate it instead." }); }
    }
}
