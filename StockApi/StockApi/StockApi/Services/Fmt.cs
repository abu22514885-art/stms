using System.Globalization;

namespace StockApi.Services;

public static class Fmt
{
    public static string Money(decimal v) => v.ToString("N2", CultureInfo.InvariantCulture);
}
