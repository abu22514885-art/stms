using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

public record RegisterRequest(string FullName, string Username, string Password);
public record LoginRequest(string Username, string Password);
public record LoginResponse(string Token, string FullName, string Role);

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, JwtService jwt) : ControllerBase
{
    // Salesperson asks for an account -> saved as Pending until the admin approves
    [EnableRateLimiting("auth")]
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest r)
    {
        var username = r.Username.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(r.FullName) || username.Length < 3 || r.Password.Length < 6)
            return BadRequest(new { message = "Full name, username (3+ characters) and password (6+ characters) are required." });

        if (await db.Users.AnyAsync(u => u.Username == username))
            return Conflict(new { message = "That username is already taken." });

        db.Users.Add(new AppUser
        {
            Id = Guid.NewGuid(),
            FullName = r.FullName.Trim(),
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(r.Password),
            Role = Roles.Salesperson,
            ApprovalStatus = Approval.Pending
        });
        await db.SaveChangesAsync();
        return Ok(new { message = "Request sent. You can log in after the admin approves your account." });
    }

    [EnableRateLimiting("auth")]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest r)
    {
        var username = r.Username.Trim().ToLowerInvariant();
        var u = await db.Users.FirstOrDefaultAsync(x => x.Username == username);

        if (u is null || !BCrypt.Net.BCrypt.Verify(r.Password, u.PasswordHash))
            return Unauthorized(new { message = "Wrong username or password." });
        if (u.ApprovalStatus == Approval.Pending)
            return StatusCode(403, new { message = "Your account is waiting for admin approval." });
        if (u.ApprovalStatus == Approval.Rejected)
            return StatusCode(403, new { message = "Your account request was rejected." });
        if (!u.IsActive)
            return StatusCode(403, new { message = "Your account is disabled." });

        return Ok(new LoginResponse(jwt.CreateToken(u), u.FullName, u.Role));
    }
}

[ApiController]
[Route("api/users")]
[Authorize(Roles = Roles.Admin)]
public class UsersController(AppDbContext db) : ControllerBase
{
    // GET api/users?status=Pending
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var q = db.Users.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(status)) q = q.Where(u => u.ApprovalStatus == status);
        var list = await q.OrderByDescending(u => u.CreatedAt).ThenBy(u => u.Id)
            .Select(u => new { u.Id, u.FullName, u.Username, u.Role, u.IsActive, u.ApprovalStatus, u.CreatedAt })
            .ToPagedAsync(page, pageSize);
        return Ok(list);
    }

    [HttpPost("{id:guid}/approve")]
    public Task<IActionResult> Approve(Guid id) => Decide(id, Approval.Approved);

    [HttpPost("{id:guid}/reject")]
    public Task<IActionResult> Reject(Guid id) => Decide(id, Approval.Rejected);

    [HttpPost("{id:guid}/toggle-active")]
    public async Task<IActionResult> ToggleActive(Guid id)
    {
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id);
        if (u is null) return NotFound();
        if (u.Role == Roles.Admin) return BadRequest(new { message = "Admin accounts cannot be disabled." });
        u.IsActive = !u.IsActive;
        await db.SaveChangesAsync();
        return Ok(new { u.Id, u.IsActive });
    }

    private async Task<IActionResult> Decide(Guid id, string status)
    {
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id);
        if (u is null) return NotFound();
        if (u.Role == Roles.Admin) return BadRequest(new { message = "Admin accounts cannot be changed." });

        u.ApprovalStatus = status;
        u.ApprovedBy = User.UserId();
        u.ApprovedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new { u.Id, u.ApprovalStatus });
    }
}