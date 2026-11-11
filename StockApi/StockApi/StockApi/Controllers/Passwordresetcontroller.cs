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
    public string NewPasswordHash { get; set; } = "";   // the password the user chose, already hashed
    public string Status { get; set; } = "Pending";     // Pending | Done | Dismissed
    public DateTime CreatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public Guid? ResolvedBy { get; set; }
}

public record ResetRequestBody(string? Username, string? NewPassword);

// "Forgot password": the user picks a new password, the admin approves it, then it takes effect.
[ApiController]
[Route("api/users/password-reset-requests")]
public class PasswordResetController(AppDbContext db) : ControllerBase
{
    private const string Same = "If the account exists, the admin has been notified and will set a new password.";

    // Public. Always answers the same, so nobody can find out which usernames exist.
    [HttpPost]
    [HttpPost("~/api/auth/password-reset-request")]   // second address used by the page
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Submit(ResetRequestBody r)
    {
        var username = (r.Username ?? "").Trim().ToLowerInvariant();
        var pwd = r.NewPassword ?? "";
        if (pwd.Length < 6)
            return BadRequest(new { message = "The new password must have at least 6 characters." });

        var u = username.Length == 0 ? null
            : await db.Users.FirstOrDefaultAsync(x => x.Username == username);

        if (u is not null && u.Role != Roles.Admin && u.ApprovalStatus == Approval.Approved)
        {
            // A newer request replaces the older pending one
            var old = await db.PasswordResetTickets
                .Where(x => x.UserId == u.Id && x.Status == "Pending").ToListAsync();
            foreach (var o in old) { o.Status = "Dismissed"; o.ResolvedAt = DateTime.UtcNow; }

            db.PasswordResetTickets.Add(new PasswordResetTicket
            {
                Id = Guid.NewGuid(),
                UserId = u.Id,
                Status = "Pending",
                CreatedAt = DateTime.UtcNow,
                NewPasswordHash = BCrypt.Net.BCrypt.HashPassword(pwd)
            });
            await db.SaveChangesAsync();
        }
        return Ok(new { message = Same });
    }

    // Admin: GET api/users/password-reset-requests   (plain list of pending requests)
    [HttpGet]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> List([FromQuery] string? status)
    {
        var st = string.IsNullOrEmpty(status) ? "Pending" : status;
        var list = await db.PasswordResetTickets.AsNoTracking()
            .Where(x => x.Status == st)
            .Join(db.Users, x => x.UserId, u => u.Id,
                (x, u) => new
                {
                    x.Id,
                    x.UserId,
                    u.Username,
                    u.FullName,
                    x.Status,
                    x.CreatedAt,
                    RequestedAt = x.CreatedAt,
                    x.ResolvedAt
                })
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .ToListAsync();
        return Ok(list);
    }

    // Admin approves: the password the user chose now takes effect
    [HttpPost("{id:guid}/approve")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Approve(Guid id)
    {
        var req = await db.PasswordResetTickets.FirstOrDefaultAsync(x => x.Id == id);
        if (req is null) return NotFound();
        if (req.Status != "Pending") return BadRequest(new { message = "This request is already closed." });

        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == req.UserId);
        if (u is null) return NotFound();
        if (u.Role == Roles.Admin) return BadRequest(new { message = "Admin passwords cannot be reset here." });

        u.PasswordHash = req.NewPasswordHash;
        req.NewPasswordHash = "";
        req.Status = "Done";
        req.ResolvedAt = DateTime.UtcNow;
        req.ResolvedBy = User.UserId();
        await db.SaveChangesAsync();
        return Ok(new { req.Id, req.Status });
    }

    // Admin rejects: nothing changes
    [HttpPost("{id:guid}/reject")]
    [HttpPost("{id:guid}/dismiss")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Reject(Guid id)
    {
        var req = await db.PasswordResetTickets.FirstOrDefaultAsync(x => x.Id == id);
        if (req is null) return NotFound();
        if (req.Status != "Pending") return BadRequest(new { message = "This request is already closed." });

        req.NewPasswordHash = "";
        req.Status = "Dismissed";
        req.ResolvedAt = DateTime.UtcNow;
        req.ResolvedBy = User.UserId();
        await db.SaveChangesAsync();
        return Ok(new { req.Id, req.Status });
    }
}