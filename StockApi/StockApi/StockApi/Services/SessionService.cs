using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockApi.Data;

namespace StockApi.Services;

public record MethodCount(string Method, int Count);

// Counts only: salespeople never see money totals.
public record SessionSummary(
    Guid? SessionId, string State,          // State: NotStarted | Open | CheckedOut
    DateTime? StartedAt, DateTime? CheckedOutAt,
    int Transactions, int ItemsSold, int LoanSales, int LoanPaymentsReceived,
    List<MethodCount> PaymentsByMethod);

public class SessionService(AppDbContext db, TimeService time)
{
    // Returns the session to sell in. Starts today's session on the first sale.
    // After check-out, selling is blocked for the rest of the day (an admin can reopen).
    public async Task<(SalesSession? Session, string? Error)> GetForSellingAsync(Guid userId)
    {
        var today = time.Today();
        var open = await db.SalesSessions
            .FirstOrDefaultAsync(s => s.SalespersonId == userId && s.CheckedOutAt == null);

        // Forgot to check out on a previous day: close it and start fresh
        if (open is not null && open.SessionDate < today)
        {
            open.CheckedOutAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            open = null;
        }
        if (open is not null) return (open, null);

        var closedToday = await db.SalesSessions
            .AnyAsync(s => s.SalespersonId == userId && s.SessionDate == today && s.CheckedOutAt != null);
        if (closedToday) return (null, "You already checked out for today. Ask the admin to reopen your session.");

        var session = new SalesSession
        {
            Id = Guid.NewGuid(), SalespersonId = userId,
            SessionDate = today, StartedAt = DateTime.UtcNow
        };
        db.SalesSessions.Add(session);
        try
        {
            await db.SaveChangesAsync();
            return (session, null);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // two requests started a session at the same moment: use the one that won
            db.Entry(session).State = EntityState.Detached;
            var again = await db.SalesSessions
                .FirstOrDefaultAsync(s => s.SalespersonId == userId && s.CheckedOutAt == null);
            return again is null ? (null, "Could not start the sales session. Try again.") : (again, null);
        }
    }

    public async Task<SalesSession?> OpenSessionAsync(Guid userId) =>
        await db.SalesSessions.FirstOrDefaultAsync(s => s.SalespersonId == userId && s.CheckedOutAt == null);

    // Today's session state for the dashboard
    public async Task<SessionSummary> TodayAsync(Guid userId)
    {
        var today = time.Today();
        var s = await db.SalesSessions.AsNoTracking()
            .Where(x => x.SalespersonId == userId && x.SessionDate == today)
            .OrderByDescending(x => x.StartedAt)
            .FirstOrDefaultAsync();

        if (s is null)
            return new SessionSummary(null, "NotStarted", null, null, 0, 0, 0, 0, new());
        return await SummaryAsync(s);
    }

    public async Task<SessionSummary> SummaryAsync(SalesSession s)
    {
        var end = s.CheckedOutAt ?? DateTime.UtcNow;

        var transactions = await db.Sales.CountAsync(x => x.SessionId == s.Id);
        var loanSales = await db.Sales.CountAsync(x => x.SessionId == s.Id && x.IsLoan);
        var itemsSold = await db.Sales.Where(x => x.SessionId == s.Id)
            .SelectMany(x => x.Items).SumAsync(i => (int?)i.Quantity) ?? 0;

        var mine = db.Payments.Where(p => p.ReceivedBy == s.SalespersonId && p.PaidAt >= s.StartedAt && p.PaidAt <= end);
        var repayments = await mine.CountAsync(p => p.IsLoanRepayment);
        var byMethod = await mine
            .GroupBy(p => p.PaymentMethod!.Name)
            .Select(g => new MethodCount(g.Key, g.Count()))
            .ToListAsync();

        return new SessionSummary(s.Id, s.CheckedOutAt is null ? "Open" : "CheckedOut",
            s.StartedAt, s.CheckedOutAt, transactions, itemsSold, loanSales, repayments, byMethod);
    }
}
