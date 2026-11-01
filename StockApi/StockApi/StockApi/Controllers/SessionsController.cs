using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

[ApiController]
[Route("api/sessions")]
[Authorize]
public class SessionsController(AppDbContext db, SessionService sessions, TimeService time) : ControllerBase
{
    // Today's state for the dashboard (NotStarted / Open / CheckedOut) with counts, no money
    [HttpGet("today")]
    public async Task<IActionResult> Today() => Ok(await sessions.TodayAsync(User.UserId()));

    // "Check out": ends the daily sales
    [HttpPost("checkout")]
    public async Task<IActionResult> Checkout()
    {
        var s = await sessions.OpenSessionAsync(User.UserId());
        if (s is null) return BadRequest(new { message = "There is no open sales session to check out." });

        s.CheckedOutAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(await sessions.SummaryAsync(s));
    }

    // Admin: sessions of a day (default today)
    [HttpGet]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> List([FromQuery] DateTime? date)
    {
        var day = date.HasValue ? DateOnly.FromDateTime(date.Value) : time.Today();
        var rows = await db.SalesSessions.AsNoTracking()
            .Where(s => s.SessionDate == day)
            .Join(db.Users, s => s.SalespersonId, u => u.Id,
                (s, u) => new { s.Id, s.SalespersonId, Salesperson = u.FullName, s.SessionDate, s.StartedAt, s.CheckedOutAt })
            .OrderBy(x => x.StartedAt)
            .ToListAsync();
        return Ok(rows);
    }

    // Admin: undo a check-out (e.g. pressed by mistake)
    [HttpPost("{id:guid}/reopen")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Reopen(Guid id)
    {
        var s = await db.SalesSessions.FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return NotFound();
        s.CheckedOutAt = null;
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        { return Conflict(new { message = "This salesperson already has another open session." }); }
        return Ok(new { s.Id, State = "Open" });
    }
}
