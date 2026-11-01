namespace StockApi.Services;

// "Today" must follow the shop's local time, not the server's.
public class TimeService
{
    private readonly TimeZoneInfo _tz;

    // Time zone name as PostgreSQL knows it (used to group sales by local day/month in SQL)
    public string ZoneId { get; }

    public TimeService(IConfiguration cfg)
    {
        var id = cfg["App:TimeZone"] ?? "Africa/Addis_Ababa";
        ZoneId = id;
        try { _tz = TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch
        {
            try { _tz = TimeZoneInfo.FindSystemTimeZoneById("E. Africa Standard Time"); }
            catch { _tz = TimeZoneInfo.Utc; }
        }
    }

    public DateTime ToLocal(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), _tz);

    public DateOnly Today() => DateOnly.FromDateTime(ToLocal(DateTime.UtcNow));

    // Weeks start on Monday
    public DateOnly StartOfWeek(DateOnly d) => d.AddDays(-(((int)d.DayOfWeek + 6) % 7));

    // From the start of fromDay to the end of toDayInclusive (end excluded), in UTC
    public (DateTime StartUtc, DateTime EndUtc) RangeUtc(DateOnly fromDay, DateOnly toDayInclusive) =>
        (DayRangeUtc(fromDay).StartUtc, DayRangeUtc(toDayInclusive).EndUtc);

    // Start (inclusive) and end (exclusive) of a local day, in UTC
    public (DateTime StartUtc, DateTime EndUtc) DayRangeUtc(DateOnly day)
    {
        var start = TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), _tz);
        var end = TimeZoneInfo.ConvertTimeToUtc(day.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), _tz);
        return (start, end);
    }
}

public static class PhoneHelper
{
    // Keeps digits only. Ethiopian numbers are stored in the local form 09xxxxxxxx
    // (+251911..., 251911... and 911... all become 0911...), so one customer is never duplicated.
    public static string? Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = new string(raw.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("251") && digits.Length == 12) digits = "0" + digits[3..];
        else if (digits.Length == 9 && (digits[0] == '9' || digits[0] == '7')) digits = "0" + digits;
        return digits.Length is >= 7 and <= 15 ? digits : null;
    }
}
