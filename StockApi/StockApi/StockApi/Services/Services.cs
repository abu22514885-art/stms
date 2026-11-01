using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StockApi.Data;

namespace StockApi.Services;

public static class ClaimsExt
{
    public static Guid UserId(this ClaimsPrincipal u) => Guid.Parse(u.FindFirst("sub")!.Value);
}

public class JwtService(IConfiguration cfg)
{
    public string CreateToken(AppUser u)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg["Jwt:Key"]!));
        var claims = new[]
        {
            new Claim("sub", u.Id.ToString()),
            new Claim("name", u.FullName),
            new Claim("role", u.Role)
        };
        var token = new JwtSecurityToken(
            issuer: cfg["Jwt:Issuer"],
            audience: cfg["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(int.Parse(cfg["Jwt:ExpiryMinutes"] ?? "480")),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public class VatService(AppDbContext db)
{
    public async Task<decimal> GetRateAsync()
    {
        var v = await db.Settings.AsNoTracking()
            .Where(s => s.Key == "vat_rate").Select(s => s.Value).FirstOrDefaultAsync();
        return decimal.TryParse(v, NumberStyles.Any, CultureInfo.InvariantCulture, out var r) ? r : 0.15m;
    }

    // Rounds to 2 decimals so the DB check (price_with_vat = price + vat_amount) always passes
    public static (decimal Price, decimal Vat, decimal WithVat) Compute(decimal price, decimal rate)
    {
        price = Math.Round(price, 2, MidpointRounding.AwayFromZero);
        var vat = Math.Round(price * rate, 2, MidpointRounding.AwayFromZero);
        return (price, vat, price + vat);
    }
}

public static class StockInfo
{
    public const string Green = "Green";    // enough stock
    public const string Yellow = "Yellow";  // 25% or less of the stocked amount is left
    public const string Red = "Red";        // out of stock

    public static string Status(int quantity, int stocked) =>
        quantity <= 0 ? Red :
        (stocked > 0 && quantity * 4 <= stocked) ? Yellow : Green;
}

public static class DbSeeder
{
    public static async Task SeedAdminAsync(AppDbContext db, IConfiguration cfg)
    {
        var hash = BCrypt.Net.BCrypt.HashPassword(cfg["Seed:AdminPassword"] ?? "ChangeMe123!");
        var admin = await db.Users.FirstOrDefaultAsync(u => u.Username == "admin");

        if (admin is null)
        {
            var id = Guid.NewGuid();
            db.Users.Add(new AppUser
            {
                Id = id, FullName = "System Admin", Username = "admin", PasswordHash = hash,
                Role = Roles.Admin, ApprovalStatus = Approval.Approved,
                ApprovedBy = id, ApprovedAt = DateTime.UtcNow
            });
        }
        else if (admin.PasswordHash.Contains("REPLACE_WITH_REAL_HASH"))
        {
            admin.PasswordHash = hash;   // replace the placeholder from schema.sql
        }
        await db.SaveChangesAsync();
    }
}
