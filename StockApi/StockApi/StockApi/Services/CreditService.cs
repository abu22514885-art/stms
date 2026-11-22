using System.Globalization;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;

namespace StockApi.Services;

public record CreditPolicy(int DueDays, int GraceDays, decimal PenaltyRate, int BlockDays, DateOnly EffectiveFrom);
public record PayPoint(DateOnly Date, decimal Principal);     // a payment's part that paid the sale itself
public record PenaltyPeriod(int No, DateOnly Start);

public record CreditInfo(DateOnly? DueDate, DateOnly? GraceEnd, int OverdueDays, int DaysToDue, string Status,
    decimal Principal, decimal PenaltyCharged, decimal PenaltyPaid, decimal PenaltyDue, decimal TotalDue,
    DateOnly? NextPenaltyDate);

public record CreditRow(Guid SaleId, string InvoiceNo, string Customer, string Phone, DateOnly? DueDate,
    int OverdueDays, string Status, decimal Principal, decimal PenaltyDue, decimal TotalDue);
public record CreditSummary(int OpenLoans, int CustomersOwing, int DueSoon, int InGrace, int Overdue, int Restricted,
    int OverdueCustomers, int RestrictedCustomers, decimal Principal, decimal PenaltyDue, decimal TotalDue,
    decimal OverdueAmount, decimal CollectedThisMonth, decimal PenaltyCollectedThisMonth,
    decimal PenaltyChargedThisMonth, List<CreditRow> Worst);

// All the credit rules in one place, without the database, so they can be tested alone.
//   due date     = sale date + 15 days
//   grace        = 5 days after the due date (no penalty yet)
//   penalty      = 2% of the unpaid sale balance, charged on the day after the grace ends and then once
//                  every month (simple, not compounding). The balance is the one on the first day of
//                  that month, so a payment made before that day lowers the next penalty.
//   restriction  = a customer with a loan 30 or more days past its due date cannot take new credit
public static class CreditCalc
{
    public const string Paid = "Paid", Current = "Current", DueSoon = "Due soon",
        Grace = "Grace period", Overdue = "Overdue", Restricted = "Restricted";

    public static DateOnly GraceEnd(DateOnly due, CreditPolicy p) => due.AddDays(p.GraceDays);

    public static int OverdueDays(DateOnly due, DateOnly today) => Math.Max(0, today.DayNumber - due.DayNumber);

    // Penalty months that have started by "today"
    public static List<PenaltyPeriod> Periods(DateOnly due, CreditPolicy p, DateOnly today)
    {
        var list = new List<PenaltyPeriod>();
        var first = due.AddDays(p.GraceDays + 1);
        for (var k = 1; k <= 600; k++)
        {
            var start = first.AddMonths(k - 1);
            if (start > today) break;
            list.Add(new PenaltyPeriod(k, start));
        }
        return list;
    }

    // Unpaid sale balance at the start of a day (payments made before that day count)
    public static decimal BalanceAt(decimal total, IEnumerable<PayPoint> pays, DateOnly day) =>
        total - pays.Where(x => x.Date < day).Sum(x => x.Principal);

    public static decimal Penalty(decimal balance, decimal rate) =>
        Math.Round(balance * rate, 2, MidpointRounding.AwayFromZero);

    public static string Status(bool paid, int overdueDays, int daysToDue, CreditPolicy p)
    {
        if (paid) return Paid;
        if (overdueDays >= p.BlockDays) return Restricted;
        if (overdueDays > p.GraceDays) return Overdue;
        if (overdueDays > 0) return Grace;
        return daysToDue <= 3 ? DueSoon : Current;
    }

    // Reminder steps (days from the due date): 3 and 1 days before, on the due day, 1 day after,
    // when the grace ends, then every 5 days to day 30, then weekly.
    public static int? LatestMilestone(int offset, CreditPolicy p)
    {
        var steps = new SortedSet<int> { -3, -1, 0, 1, p.GraceDays };
        for (var d = p.GraceDays + 5; d <= p.BlockDays; d += 5) steps.Add(d);
        steps.Add(p.BlockDays);
        for (var d = p.BlockDays + 7; d <= Math.Max(offset, p.BlockDays + 7); d += 7) steps.Add(d);
        int? best = null;
        foreach (var s in steps) if (s <= offset) best = s;
        return best;
    }

    public static string Kind(int milestone) => milestone < 0 ? $"d{milestone}" : $"d+{milestone}";
}

public class CreditService(AppDbContext db, TimeService time)
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static DateTime _lastSync = DateTime.MinValue;
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    public async Task<CreditPolicy> PolicyAsync()
    {
        var keys = new[] { "credit_due_days", "credit_grace_days", "credit_penalty_rate", "credit_block_days", "credit_policy_start" };
        var d = await db.Settings.AsNoTracking().Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, s => s.Value);
        int I(string k, int def) => d.TryGetValue(k, out var v) && int.TryParse(v, NumberStyles.Integer, Inv, out var n) && n >= 0 ? n : def;
        var rate = d.TryGetValue("credit_penalty_rate", out var r) && decimal.TryParse(r, NumberStyles.Any, Inv, out var rr) && rr >= 0 ? rr : 0.02m;
        var start = d.TryGetValue("credit_policy_start", out var sv) && DateOnly.TryParseExact(sv, "yyyy-MM-dd", Inv, DateTimeStyles.None, out var sd)
            ? sd : new DateOnly(2000, 1, 1);
        return new CreditPolicy(I("credit_due_days", 15), I("credit_grace_days", 5), rate, I("credit_block_days", 30), start);
    }

    public async Task<DateOnly> NewDueDateAsync() => time.Today().AddDays((await PolicyAsync()).DueDays);

    // Brings every open loan up to date: adds the penalty months that have started and raises
    // reminders. It is safe to call many times (each penalty month / reminder step exists once).
    // Normal reads call it at most every 5 minutes; a payment or a credit check forces it.
    public async Task SyncAsync(bool force = false)
    {
        if (!force && DateTime.UtcNow - _lastSync < TimeSpan.FromMinutes(5)) return;
        await Gate.WaitAsync();
        try
        {
            if (!force && DateTime.UtcNow - _lastSync < TimeSpan.FromMinutes(5)) return;
            var policy = await PolicyAsync();
            var today = time.Today();

            var loans = await db.Sales.AsNoTracking()
                .Where(s => s.IsLoan && s.Status != SaleStatus.Paid && s.DueDate != null)
                .Select(s => new { s.Id, s.Total, DueDate = s.DueDate!.Value }).ToListAsync();
            if (loans.Count == 0) { _lastSync = DateTime.UtcNow; return; }

            var ids = loans.Select(l => l.Id).ToList();
            var pays = (await db.Payments.AsNoTracking().Where(p => ids.Contains(p.SaleId))
                    .Select(p => new { p.SaleId, p.PaidAt, p.Amount, p.PenaltyPortion }).ToListAsync())
                .GroupBy(p => p.SaleId)
                .ToDictionary(g => g.Key, g => g.Select(p =>
                    new PayPoint(DateOnly.FromDateTime(time.ToLocal(p.PaidAt)), p.Amount - p.PenaltyPortion)).ToList());
            var have = (await db.LoanPenalties.AsNoTracking().Where(x => ids.Contains(x.SaleId))
                    .Select(x => new { x.SaleId, x.PeriodNo }).ToListAsync())
                .GroupBy(x => x.SaleId).ToDictionary(g => g.Key, g => g.Select(x => x.PeriodNo).ToHashSet());
            var reminded = (await db.LoanReminders.AsNoTracking().Where(x => ids.Contains(x.SaleId))
                    .Select(x => new { x.SaleId, x.Kind }).ToListAsync())
                .GroupBy(x => x.SaleId).ToDictionary(g => g.Key, g => g.Select(x => x.Kind).ToHashSet());

            foreach (var l in loans)
            {
                var myPays = pays.GetValueOrDefault(l.Id) ?? new List<PayPoint>();
                var done = have.GetValueOrDefault(l.Id) ?? new HashSet<int>();
                foreach (var per in CreditCalc.Periods(l.DueDate, policy, today))
                {
                    if (done.Contains(per.No) || per.Start < policy.EffectiveFrom) continue;
                    var bal = CreditCalc.BalanceAt(l.Total, myPays, per.Start);
                    if (bal <= 0) continue;
                    var amount = CreditCalc.Penalty(bal, policy.PenaltyRate);
                    if (amount <= 0) continue;
                    db.LoanPenalties.Add(new LoanPenalty
                    {
                        Id = Guid.NewGuid(),
                        SaleId = l.Id,
                        PeriodNo = per.No,
                        PeriodStart = per.Start,
                        BalanceBase = bal,
                        Rate = policy.PenaltyRate,
                        Amount = amount
                    });
                }

                var offset = today.DayNumber - l.DueDate.DayNumber;
                var m = CreditCalc.LatestMilestone(offset, policy);
                if (m is not null)
                {
                    var kind = CreditCalc.Kind(m.Value);
                    if (!(reminded.GetValueOrDefault(l.Id)?.Contains(kind) ?? false))
                        db.LoanReminders.Add(new LoanReminder { Id = Guid.NewGuid(), SaleId = l.Id, Kind = kind, DueOffset = m.Value });
                }
            }

            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException)
            {
                // another server instance added the same rows first: nothing is lost, try again next time
                db.ChangeTracker.Clear();
            }
            _lastSync = DateTime.UtcNow;
        }
        finally { Gate.Release(); }
    }

    // Balance, due date, overdue days, penalty and status for the given sales
    public async Task<Dictionary<Guid, CreditInfo>> InfosAsync(IEnumerable<Guid> saleIds)
    {
        var ids = saleIds.Distinct().ToList();
        var policy = await PolicyAsync();
        var today = time.Today();

        var sales = await db.Sales.AsNoTracking().Where(s => ids.Contains(s.Id))
            .Select(s => new { s.Id, s.Total, s.AmountPaid, s.Status, s.DueDate }).ToListAsync();
        var charged = await db.LoanPenalties.AsNoTracking().Where(x => ids.Contains(x.SaleId))
            .GroupBy(x => x.SaleId).Select(g => new { Id = g.Key, Sum = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Sum);
        var paid = await db.Payments.AsNoTracking().Where(p => ids.Contains(p.SaleId))
            .GroupBy(p => p.SaleId).Select(g => new { Id = g.Key, Sum = g.Sum(p => p.PenaltyPortion) }).ToDictionaryAsync(x => x.Id, x => x.Sum);

        var result = new Dictionary<Guid, CreditInfo>();
        foreach (var s in sales)
        {
            var principal = s.Total - s.AmountPaid;
            var pc = charged.GetValueOrDefault(s.Id);
            var pp = paid.GetValueOrDefault(s.Id);
            var pd = pc - pp;
            var isPaid = s.Status == SaleStatus.Paid && pd <= 0;
            if (s.DueDate is null)
            {
                result[s.Id] = new CreditInfo(null, null, 0, 0, isPaid ? CreditCalc.Paid : CreditCalc.Current,
                    principal, pc, pp, pd, principal + pd, null);
                continue;
            }
            var due = s.DueDate.Value;
            var overdue = CreditCalc.OverdueDays(due, today);
            var toDue = due.DayNumber - today.DayNumber;
            DateOnly? next = null;
            if (!isPaid)
            {
                var first = due.AddDays(policy.GraceDays + 1);
                var k = 0;
                do { next = first.AddMonths(k++); } while ((next <= today || next < policy.EffectiveFrom) && k < 600);
            }
            result[s.Id] = new CreditInfo(due, CreditCalc.GraceEnd(due, policy), overdue, toDue,
                CreditCalc.Status(isPaid, overdue, toDue, policy), principal, pc, pp, pd, principal + pd, next);
        }
        return result;
    }

    // Everything the dashboard needs about credit in one call
    public async Task<CreditSummary> SummaryAsync()
    {
        await SyncAsync();
        var today = time.Today();
        var open = await db.Sales.AsNoTracking()
            .Where(s => s.IsLoan && s.Status != SaleStatus.Paid)
            .Select(s => new {
                s.Id,
                s.InvoiceNo,
                s.CustomerId,
                Name = s.Customer != null ? s.Customer.FullName : "",
                Phone = s.Customer != null ? s.Customer.Phone : ""
            }).ToListAsync();
        var infos = await InfosAsync(open.Select(o => o.Id));

        var rows = open.Select(o => (o, i: infos[o.Id])).ToList();
        int Count(string st) => rows.Count(x => x.i.Status == st);
        var overdueRows = rows.Where(x => x.i.OverdueDays > 0).ToList();

        var (from, to) = time.RangeUtc(new DateOnly(today.Year, today.Month, 1), today);
        var monthPays = await db.Payments.AsNoTracking()
            .Where(p => p.IsLoanRepayment && p.PaidAt >= from && p.PaidAt < to)
            .Select(p => new { p.Amount, p.PenaltyPortion }).ToListAsync();
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var charged = await db.LoanPenalties.AsNoTracking()
            .Where(x => x.PeriodStart >= monthStart && x.PeriodStart <= today).SumAsync(x => (decimal?)x.Amount) ?? 0m;

        return new CreditSummary(
            rows.Count,
            rows.Where(x => x.o.CustomerId != null).Select(x => x.o.CustomerId).Distinct().Count(),
            Count(CreditCalc.DueSoon), Count(CreditCalc.Grace), Count(CreditCalc.Overdue), Count(CreditCalc.Restricted),
            overdueRows.Where(x => x.o.CustomerId != null).Select(x => x.o.CustomerId).Distinct().Count(),
            rows.Where(x => x.i.Status == CreditCalc.Restricted && x.o.CustomerId != null).Select(x => x.o.CustomerId).Distinct().Count(),
            rows.Sum(x => x.i.Principal), rows.Sum(x => x.i.PenaltyDue), rows.Sum(x => x.i.TotalDue),
            overdueRows.Sum(x => x.i.TotalDue),
            monthPays.Sum(p => p.Amount), monthPays.Sum(p => p.PenaltyPortion), charged,
            overdueRows.OrderByDescending(x => x.i.OverdueDays).ThenByDescending(x => x.i.TotalDue).Take(5)
                .Select(x => new CreditRow(x.o.Id, x.o.InvoiceNo, x.o.Name, x.o.Phone, x.i.DueDate, x.i.OverdueDays,
                    x.i.Status, x.i.Principal, x.i.PenaltyDue, x.i.TotalDue)).ToList());
    }

    // A customer with a loan that is 30 days (or more) past its due date cannot take new credit.
    public async Task<(bool Blocked, string? Message)> CheckBlockedAsync(Guid customerId)
    {
        await SyncAsync(force: true);
        var policy = await PolicyAsync();
        var today = time.Today();
        var limit = today.AddDays(-policy.BlockDays);

        var worst = await db.Sales.AsNoTracking()
            .Where(s => s.IsLoan && s.CustomerId == customerId && s.Status != SaleStatus.Paid
                        && s.DueDate != null && s.DueDate <= limit)
            .OrderBy(s => s.DueDate).Select(s => new { s.Id, s.InvoiceNo, s.DueDate }).FirstOrDefaultAsync();
        if (worst is null) return (false, null);

        var info = (await InfosAsync(new[] { worst.Id }))[worst.Id];
        return (true, $"Credit is blocked for this customer: invoice {worst.InvoiceNo} is {info.OverdueDays} days overdue " +
                      $"(limit {policy.BlockDays}). The customer must pay the overdue amount ({Fmt.Money(info.TotalDue)}) before taking more credit.");
    }
}

// Runs the sync every hour while the API is awake, so penalties and reminders are ready
// before anyone opens the loans page. (On a sleeping free server the loans page and the
// dashboard run the same sync when they are opened, so nothing is missed.)
public class CreditMonitor(IServiceScopeFactory scopes, ILogger<CreditMonitor> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(30), stop); } catch (OperationCanceledException) { return; }
        while (!stop.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<CreditService>().SyncAsync(force: true);
            }
            catch (Exception ex) { log.LogWarning(ex, "Credit monitor run failed"); }
            try { await Task.Delay(TimeSpan.FromHours(1), stop); } catch (OperationCanceledException) { return; }
        }
    }
}