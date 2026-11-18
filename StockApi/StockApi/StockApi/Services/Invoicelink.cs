using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace StockApi.Services;

// The QR code on every invoice holds a link to the verification page, signed with a secret only this server knows.
// A forged or edited receipt cannot produce a matching signature, so the check shows "invalid".
public static class InvoiceLink
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    private static byte[] Key(IConfiguration c) =>
        Encoding.UTF8.GetBytes(c["Verify:Secret"] ?? c["Jwt:Key"] ?? "change-this-secret");

    // Only values that never change after the sale is made (so a later loan payment does not break the QR)
    public static string Sign(IConfiguration c, string invoiceNo, DateTime createdUtc, decimal subtotal, decimal vat, decimal total)
    {
        var msg = string.Join("|", invoiceNo, createdUtc.ToString("yyyyMMddHHmmss", Inv),
            subtotal.ToString("F2", Inv), vat.ToString("F2", Inv), total.ToString("F2", Inv));
        var hash = HMACSHA256.HashData(Key(c), Encoding.UTF8.GetBytes(msg));
        return Convert.ToBase64String(hash, 0, 16).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static bool Matches(string? given, string expected) =>
        given is not null &&
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected));

    // The website address the QR opens. Set Verify__BaseUrl, or the first Cors__Origins address is used.
    public static string BaseUrl(IConfiguration c)
    {
        var fromConfig = c["Verify:BaseUrl"];
        if (!string.IsNullOrWhiteSpace(fromConfig)) return fromConfig.Trim().Trim('"', '\'').TrimEnd('/');
        var first = (c["Cors:Origins"] ?? "http://localhost:4200")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).First();
        return first.Trim('"', '\'', ' ').TrimEnd('/');
    }

    public static string Url(IConfiguration c, string invoiceNo, DateTime createdUtc, decimal subtotal, decimal vat, decimal total) =>
        $"{BaseUrl(c)}/verify/{Uri.EscapeDataString(invoiceNo)}?s={Sign(c, invoiceNo, createdUtc, subtotal, vat, total)}";
}