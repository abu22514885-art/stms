using Microsoft.EntityFrameworkCore;
using StockApi.Data;

namespace StockApi.Services;

public record CompanyInfo(string Name, string? Address, string? Phone, string? Tin);

public class SettingsService(AppDbContext db)
{
    public static readonly string[] CompanyKeys =
        { "company_name", "company_address", "company_phone", "company_tin" };

    public async Task<CompanyInfo> GetCompanyAsync()
    {
        var d = await db.Settings.AsNoTracking()
            .Where(s => CompanyKeys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value);

        string? Get(string k) => d.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v) ? v : null;
        return new CompanyInfo(Get("company_name") ?? "My Company",
            Get("company_address"), Get("company_phone"), Get("company_tin"));
    }

    public async Task SetAsync(string key, string? value)
    {
        var row = await db.Settings.FirstOrDefaultAsync(s => s.Key == key);
        if (row is null) db.Settings.Add(new Setting { Key = key, Value = value?.Trim() ?? "" });
        else row.Value = value?.Trim() ?? "";
    }
}
