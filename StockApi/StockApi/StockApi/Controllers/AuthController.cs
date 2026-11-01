using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

public record RegisterRequest(string FullName, string Username, string Password);
public record LoginRequest(string Username, string Password);
public record PasswordResetSubmission(string? Username, string? NewPassword);
public record LoginResponse(string Token, string FullName, string Role);

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, JwtService jwt, WebPushNotificationService notifications) : ControllerBase
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
    [HttpPost("password-reset-request")]
    public async Task<IActionResult> RequestPasswordReset(PasswordResetSubmission request)
    {
        var username = request.Username?.Trim().ToLowerInvariant() ?? "";
        var newPassword = request.NewPassword;
        if (username.Length < 3 || string.IsNullOrEmpty(newPassword) || newPassword.Length < 8)
            return BadRequest(new { message = "Enter a valid username and a new password with at least 8 characters." });

        var user = await db.Users.FirstOrDefaultAsync(item => item.Username == username &&
            item.Role == Roles.Salesperson && item.IsActive && item.ApprovalStatus == Approval.Approved);
        if (user is not null)
        {
            var pending = await db.PasswordResetRequests.AnyAsync(item =>
                item.UserId == user.Id && item.Status == "Pending");
            if (!pending)
            {
                var reset = new PasswordResetRequest
                {
                    Id = Guid.NewGuid(), UserId = user.Id,
                    NewPasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword)
                };
                db.PasswordResetRequests.Add(reset);
                try
                {
                    await db.SaveChangesAsync();
                    await notifications.SendToAdminsAsync("Password reset request", $"{user.FullName} requested a password reset.", "/users");
                }
                catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
                {
                    db.Entry(reset).State = EntityState.Detached;
                }
            }
        }

        return Ok(new { message = "If an active salesperson account matches, the reset request was sent for admin approval." });
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
public class UsersController(AppDbContext db, WebPushNotificationService notifications) : ControllerBase
{
    public record PasswordResetRequestItem(Guid Id, Guid UserId, string FullName, string Username, DateTime RequestedAt);

    [HttpGet("password-reset-requests")]
    public async Task<IActionResult> PendingPasswordResets()
    {
        var requests = await (
            from request in db.PasswordResetRequests.AsNoTracking()
            join user in db.Users.AsNoTracking() on request.UserId equals user.Id
            where request.Status == "Pending"
            orderby request.RequestedAt
            select new PasswordResetRequestItem(
                request.Id, user.Id, user.FullName, user.Username, request.RequestedAt))
            .ToListAsync();
        return Ok(requests);
    }

    [HttpPost("password-reset-requests/{id:guid}/approve")]
    public async Task<IActionResult> ApprovePasswordReset(Guid id)
    {
        var request = await db.PasswordResetRequests.FirstOrDefaultAsync(item => item.Id == id && item.Status == "Pending");
        if (request?.NewPasswordHash is null) return NotFound();
        var user = await db.Users.FirstOrDefaultAsync(item => item.Id == request.UserId);
        if (user is null) return NotFound();

        user.PasswordHash = request.NewPasswordHash;
        request.NewPasswordHash = null;
        request.Status = "Approved";
        request.ReviewedBy = User.UserId();
        request.ReviewedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await notifications.SendToUserAsync(user.Id, "Password reset approved", "Your new password is ready to use.", "/login");
        return Ok(new { request.Id, request.Status });
    }

    [HttpPost("password-reset-requests/{id:guid}/reject")]
    public async Task<IActionResult> RejectPasswordReset(Guid id)
    {
        var request = await db.PasswordResetRequests.FirstOrDefaultAsync(item => item.Id == id && item.Status == "Pending");
        if (request is null) return NotFound();
        request.NewPasswordHash = null;
        request.Status = "Rejected";
        request.ReviewedBy = User.UserId();
        request.ReviewedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await notifications.SendToUserAsync(request.UserId, "Password reset declined", "Your reset request was declined. Contact an admin for help.", "/login");
        return Ok(new { request.Id, request.Status });
    }

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
