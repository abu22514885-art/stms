using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

public record ChangeUsernameRequest(string NewUsername, string CurrentPassword);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record PreferencesRequest(string? Mode, string? Accent, string? Font, string? Size);

// "My account": every signed-in user manages their own username, password and look.
// Users are linked everywhere by Id, so changing a username never touches sales or other history.
[ApiController]
[Route("api/account")]
[Authorize]
public class AccountController(AppDbContext db, ILogger<AccountController> log) : ControllerBase
{
    private static readonly Regex UsernameRule = new("^[a-z0-9._-]{3,30}$", RegexOptions.Compiled);
    private static readonly string[] Modes = { "system", "light", "dark" };
    private static readonly string[] Sizes = { "small", "normal", "large", "xlarge" };
    private static readonly Regex Accent = new("^[a-z0-9-]{2,20}$", RegexOptions.Compiled);
    private static readonly Regex Font = new("^[a-z0-9-]{2,30}$", RegexOptions.Compiled);

    private IActionResult Bad(string message) => BadRequest(new { message });

    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var u = await db.Users.AsNoTracking().Where(x => x.Id == User.UserId())
            .Select(x => new { x.Id, x.FullName, x.Username, x.Role }).FirstOrDefaultAsync();
        return u is null ? NotFound() : Ok(u);
    }

    [EnableRateLimiting("auth")]
    [HttpPut("username")]
    public async Task<IActionResult> ChangeUsername(ChangeUsernameRequest r)
    {
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == User.UserId());
        if (u is null) return NotFound();

        var name = (r.NewUsername ?? "").Trim().ToLowerInvariant();
        if (!UsernameRule.IsMatch(name))
            return Bad("Username must be 3 to 30 characters: letters, numbers, dot, dash or underscore.");
        if (string.IsNullOrEmpty(r.CurrentPassword) || !BCrypt.Net.BCrypt.Verify(r.CurrentPassword, u.PasswordHash))
            return Bad("Your current password is wrong.");
        if (name == u.Username) return Bad("That is already your username.");
        if (await db.Users.AnyAsync(x => x.Username == name && x.Id != u.Id))
            return Conflict(new { message = "That username is already taken." });

        var old = u.Username;
        u.Username = name;
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        { return Conflict(new { message = "That username is already taken." }); }

        log.LogInformation("User {UserId} changed username from {Old} to {New}", u.Id, old, name);
        return Ok(new { u.Username });
    }

    [EnableRateLimiting("auth")]
    [HttpPost("password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest r)
    {
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == User.UserId());
        if (u is null) return NotFound();

        if (string.IsNullOrEmpty(r.CurrentPassword) || !BCrypt.Net.BCrypt.Verify(r.CurrentPassword, u.PasswordHash))
            return Bad("Your current password is wrong.");
        var pw = r.NewPassword ?? "";
        if (pw.Length < 8 || pw.Length > 100) return Bad("New password must be 8 to 100 characters.");
        if (pw == r.CurrentPassword) return Bad("The new password must be different from the current one.");
        if (!pw.Any(char.IsLetter) || !pw.Any(char.IsDigit)) return Bad("New password needs at least one letter and one number.");

        u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(pw);
        await db.SaveChangesAsync();
        log.LogInformation("User {UserId} changed their password", u.Id);
        return NoContent();
    }

    [HttpGet("preferences")]
    public async Task<IActionResult> GetPreferences()
    {
        var p = await db.UserPreferences.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == User.UserId());
        return Content(p?.Data ?? "{}", "application/json");
    }

    [HttpPut("preferences")]
    public async Task<IActionResult> SavePreferences(PreferencesRequest r)
    {
        if (r.Mode is not null && !Modes.Contains(r.Mode)) return Bad("Unknown theme.");
        if (r.Size is not null && !Sizes.Contains(r.Size)) return Bad("Unknown font size.");
        if (r.Accent is not null && !Accent.IsMatch(r.Accent)) return Bad("Unknown accent color.");
        if (r.Font is not null && !Font.IsMatch(r.Font)) return Bad("Unknown font.");

        var json = JsonSerializer.Serialize(new
        {
            mode = r.Mode,
            accent = r.Accent,
            font = r.Font,
            size = r.Size
        });
        var id = User.UserId();
        var p = await db.UserPreferences.FirstOrDefaultAsync(x => x.UserId == id);
        if (p is null) db.UserPreferences.Add(new UserPreference { UserId = id, Data = json, UpdatedAt = DateTime.UtcNow });
        else { p.Data = json; p.UpdatedAt = DateTime.UtcNow; }
        await db.SaveChangesAsync();
        return NoContent();
    }
}