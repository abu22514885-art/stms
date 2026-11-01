using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

public record CompanyRequest(string CompanyName, string? Address, string? Phone, string? Tin);

[ApiController]
[Route("api/settings")]
[Authorize(Roles = Roles.Admin)]
public class SettingsController(AppDbContext db, SettingsService settings, VatService vat) : ControllerBase
{
    // Company details printed on receipts
    [HttpGet("company")]
    public async Task<IActionResult> Get() =>
        Ok(new { company = await settings.GetCompanyAsync(), vatRatePercent = await vat.GetRateAsync() * 100m });

    [HttpPut("company")]
    public async Task<IActionResult> Put(CompanyRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.CompanyName)) return BadRequest(new { message = "Company name is required." });
        await settings.SetAsync("company_name", r.CompanyName);
        await settings.SetAsync("company_address", r.Address);
        await settings.SetAsync("company_phone", r.Phone);
        await settings.SetAsync("company_tin", r.Tin);
        await db.SaveChangesAsync();
        return Ok(await settings.GetCompanyAsync());
    }
}
