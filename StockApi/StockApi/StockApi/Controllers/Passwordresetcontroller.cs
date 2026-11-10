using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

// Own table, so it cannot clash with any other password-reset class in the project
[Table("password_reset_tickets")]
public class PasswordResetTicket
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Status { get; set; } = "Pending";   // Pending | Done | Dismissed
    public DateTime CreatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public Guid? ResolvedBy { get; set; }
}

public record ResetRequestBody(string Username);
public record SetPasswordBody(string NewPassword);

// "Forgot password": the user asks, the admin sets a temporary password.
[ApiController]
[Route("api/users/password-reset-requests")]
public class PasswordResetController(AppDbContext db) : ControllerBase
{
    // Public. Always answers the same, so nobody can find out which usernames exist.
    [HttpPost]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Submit(ResetRequestBody r)
    {
        var username = (r.Username ?? "").Trim().ToLowerInvariant();
        var u = username.Length == 0 ? null
            : await db.Users.FirstOrDefaultAsync(x => x.Username == username);

        if (u is not null && u.Role != Roles.Admin && u.ApprovalStatus == Approval.Approved
            && !await db.PasswordResetTickets.AnyAsync(x => x.UserId == u.Id && x.Status == "Pending"))
        {
            db.PasswordResetTickets.Add(new PasswordResetTicket
            {
                Id = Guid.NewGuid(),
                UserId = u.Id,
                Status = "Pending",
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }
        return Ok(new { message = "If the account exists, the admin has been notified and will set a new password." });
    }

    // Admin: GET api/users/password-reset-requests?status=Pending
    [HttpGet]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var q = db.PasswordResetTickets.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(status)) q = q.Where(x => x.Status == status);

        var list = await q
            .Join(db.Users, x => x.UserId, u => u.Id,
                (x, u) => new { x.Id, x.UserId, u.Username, u.FullName, x.Status, x.CreatedAt, x.ResolvedAt })
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .ToPagedAsync(page, pageSize);
        return Ok(list);
    }

    // Admin sets the new (temporary) password and closes the request
    [HttpPost("{id:guid}/reset")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Reset(Guid id, SetPasswordBody body)
    {
        if ((body.NewPassword ?? "").Length < 6)
            return BadRequest(new { message = "The new password must have at least 6 characters." });

        var req = await db.PasswordResetTickets.FirstOrDefaultAsync(x => x.Id == id);
        if (req is null) return NotFound();
        if (req.Status != "Pending") return BadRequest(new { message = "This request is already closed." });

        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == req.UserId);
        if (u is null) return NotFound();
        if (u.Role == Roles.Admin) return BadRequest(new { message = "Admin passwords cannot be reset here." });

        u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(body.NewPassword);
        req.Status = "Done";
        req.ResolvedAt = DateTime.UtcNow;
        req.ResolvedBy = User.UserId();
        await db.SaveChangesAsync();
        return Ok(new { req.Id, req.Status });
    }

    [HttpPost("{id:guid}/dismiss")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Dismiss(Guid id)
    {
        var req = await db.PasswordResetTickets.FirstOrDefaultAsync(x => x.Id == id);
        if (req is null) return NotFound();
        if (req.Status != "Pending") return BadRequest(new { message = "This request is already closed." });

        req.Status = "Dismissed";
        req.ResolvedAt = DateTime.UtcNow;
        req.ResolvedBy = User.UserId();
        await db.SaveChangesAsync();
        return Ok(new { req.Id, req.Status });
    }
}