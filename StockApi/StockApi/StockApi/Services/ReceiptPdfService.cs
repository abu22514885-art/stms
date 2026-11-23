using System.Globalization;
using System.Reflection;
using QRCoder;
using QuestPDF.Drawing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace StockApi.Services;

// Builds the printable receipt handed to the customer, in English and Amharic side by side.
// With VAT (customer wants a receipt) it is a "TAX INVOICE / RECEIPT", otherwise a "SALES SLIP".
// The Amharic letters come from the Noto Sans Ethiopic font files in the Fonts folder
// (embedded in the program, see the EmbeddedResource line in the .csproj).
public class ReceiptPdfService(TimeService time, IConfiguration cfg)
{
    private const string Eth = "Noto Sans Ethiopic";
    private static bool _fontOk;      // true when the Amharic font was found; otherwise the receipt is English only

    static ReceiptPdfService()
    {
        foreach (var file in new[] { "NotoSansEthiopic-Regular.ttf", "NotoSansEthiopic-Bold.ttf" })
        {
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                var name = asm.GetManifestResourceNames().FirstOrDefault(n => n.EndsWith(file, StringComparison.OrdinalIgnoreCase));
                if (name is not null)
                {
                    using var s = asm.GetManifestResourceStream(name)!;
                    FontManager.RegisterFontFromStream(s);
                    _fontOk = true;
                    continue;
                }
                // Not embedded: read the file from the Fonts folder next to the program (Docker) or the project (dotnet run)
                var path = new[] { Path.Combine(AppContext.BaseDirectory, "Fonts", file), Path.Combine(Directory.GetCurrentDirectory(), "Fonts", file) }
                    .FirstOrDefault(File.Exists);
                if (path is not null)
                {
                    using var fs = File.OpenRead(path);
                    FontManager.RegisterFontFromStream(fs);
                    _fontOk = true;
                }
            }
            catch { /* without the font the Amharic letters are missing, the rest of the receipt still prints */ }
        }
    }

    private static string Money(decimal v) => v.ToString("N2", CultureInfo.InvariantCulture);

    // "English / አማርኛ" in one line
    private static void Bi(TextDescriptor t, string en, string am, bool bold = false)
    {
        var a = t.Span(en);
        if (bold) a.Bold();
        if (!_fontOk) return;      // no Amharic font on the server: print English only instead of failing
        var b = t.Span(" / ");
        var c = t.Span(am).FontFamily(Eth);
        if (bold) { b.Bold(); c.Bold(); }
    }

    private static IContainer HeadCell(IContainer c) =>
        c.BorderBottom(1).PaddingVertical(3).DefaultTextStyle(x => x.Bold());

    private static IContainer BodyCell(IContainer c) =>
        c.BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).PaddingVertical(3);

    // QR code as a PNG. It holds the invoice details so anyone can scan and compare them with the paper.
    private static byte[] Qr(string text)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
        return new PngByteQRCode(data).GetGraphic(6);
    }

    public byte[] Generate(SaleDto s, CompanyInfo company, decimal vatRatePercent)
    {
        // The QR opens the public verification page with a signed link (a fake receipt cannot copy it)
        var qrText = InvoiceLink.Url(cfg, s.InvoiceNo, s.CreatedAt, s.Subtotal, s.VatTotal, s.Total);
        var qrPng = Qr(qrText);

        var vatLabel = vatRatePercent.ToString("0.##", CultureInfo.InvariantCulture);
        var date = time.ToLocal(s.CreatedAt).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        var buyerName = s.Customer?.FullName ?? s.BuyerName;

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(24);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Column(col =>
                {
                    col.Item().AlignCenter().Text(company.Name).FontSize(16).Bold();
                    if (!string.IsNullOrWhiteSpace(company.Address))
                        col.Item().AlignCenter().Text(company.Address);
                    if (!string.IsNullOrWhiteSpace(company.Phone))
                        col.Item().AlignCenter().Text(t => { Bi(t, "Tel", "ስልክ"); t.Span($": {company.Phone}"); });
                    if (!string.IsNullOrWhiteSpace(company.Tin))
                        col.Item().AlignCenter().Text(t => { Bi(t, "TIN", "ቲን ቁጥር"); t.Span($": {company.Tin}"); });
                    col.Item().PaddingTop(6).AlignCenter().DefaultTextStyle(d => d.FontSize(11)).Text(t =>
                    {
                        if (s.WantsReceipt) Bi(t, "TAX INVOICE / RECEIPT", "የታክስ ደረሰኝ", true);
                        else Bi(t, "SALES SLIP", "የሽያጭ ደረሰኝ", true);
                    });
                });

                page.Content().PaddingVertical(8).Column(col =>
                {
                    col.Spacing(8);

                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(left =>
                        {
                            left.Item().Text(t => { Bi(t, "Invoice No", "የደረሰኝ ቁጥር"); t.Span($": {s.InvoiceNo}"); });
                            left.Item().Text(t => { Bi(t, "Date", "ቀን"); t.Span($": {date}"); });
                            left.Item().Text(t => { Bi(t, "Served by", "ሻጭ"); t.Span($": {s.Salesperson}"); });
                        });
                        row.RelativeItem().Column(right =>
                        {
                            if (!string.IsNullOrWhiteSpace(buyerName))
                                right.Item().AlignRight().Text(t => { Bi(t, "Customer", "ደንበኛ"); t.Span($": {buyerName}"); });
                            if (s.Customer is not null)
                                right.Item().AlignRight().Text(t => { Bi(t, "Phone", "ስልክ"); t.Span($": {s.Customer.Phone}"); });
                            if (!string.IsNullOrWhiteSpace(s.BuyerTin))
                                right.Item().AlignRight().Text(t => { Bi(t, "Buyer TIN", "የገዢ ቲን ቁጥር"); t.Span($": {s.BuyerTin}"); });
                            if (s.IsLoan)
                                right.Item().AlignRight().Text(t => Bi(t, "CREDIT SALE (LOAN)", "የዱቤ ሽያጭ", true));
                        });
                    });

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(4);
                            cols.ConstantColumn(40);
                            cols.RelativeColumn(2.2f);
                            cols.RelativeColumn(2);
                        });

                        table.Header(h =>
                        {
                            h.Cell().Element(HeadCell).Text(t => Bi(t, "Item", "ዕቃ", true));
                            h.Cell().Element(HeadCell).AlignRight().Text(t => Bi(t, "Qty", "ብዛት", true));
                            h.Cell().Element(HeadCell).AlignRight().Text(t => Bi(t, "Unit price", "ነጠላ ዋጋ", true));
                            h.Cell().Element(HeadCell).AlignRight().Text(t => Bi(t, "Amount", "ድምር", true));
                        });

                        foreach (var it in s.Items)
                        {
                            table.Cell().Element(BodyCell).Text(it.Name);
                            table.Cell().Element(BodyCell).AlignRight().Text(it.Quantity.ToString(CultureInfo.InvariantCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(Money(it.UnitPrice));
                            table.Cell().Element(BodyCell).AlignRight().Text(Money(it.Quantity * it.UnitPrice));
                        }
                    });

                    col.Item().AlignRight().Column(t =>
                    {
                        t.Item().AlignRight().Text(x => { Bi(x, "Subtotal", "ንዑስ ድምር"); x.Span($": {Money(s.Subtotal)}"); });
                        if (s.WantsReceipt)
                            t.Item().AlignRight().Text(x => { Bi(x, $"VAT ({vatLabel}%)", $"ተ.እ.ታ ({vatLabel}%)"); x.Span($": {Money(s.VatTotal)}"); });
                        t.Item().AlignRight().DefaultTextStyle(d => d.FontSize(11)).Text(x => { Bi(x, "TOTAL", "ጠቅላላ ድምር", true); x.Span($": {Money(s.Total)}").Bold(); });
                        t.Item().AlignRight().Text(x => { Bi(x, "Paid", "የተከፈለ"); x.Span($": {Money(s.AmountPaid)}"); });
                        if (s.Balance > 0)
                            t.Item().AlignRight().Text(x => { Bi(x, "BALANCE DUE", "ቀሪ ሂሳብ", true); x.Span($": {Money(s.Balance)}").Bold(); });
                    });

                    if (s.Payments.Count > 0)
                    {
                        col.Item().Column(p =>
                        {
                            p.Item().Text(t => Bi(t, "Payment", "ክፍያ", true));
                            foreach (var pay in s.Payments)
                            {
                                var how = pay.Provider is null ? pay.Method : $"{pay.Method} - {pay.Provider}";
                                var refText = string.IsNullOrEmpty(pay.TransactionRef) ? "" : $"  ({pay.TransactionRef})";
                                p.Item().Text($"{how}: {Money(pay.Amount)}{refText}");
                            }
                        });
                    }

                    // Invoice QR code: opens the verification page (genuine or fake)
                    col.Item().AlignCenter().Column(q =>
                    {
                        q.Item().AlignCenter().Width(80).Image(qrPng);
                        q.Item().AlignCenter().DefaultTextStyle(d => d.FontSize(7)).Text(t => Bi(t, "Scan to verify this invoice", "ደረሰኙን ለማረጋገጥ ስካን ያድርጉ"));
                    });
                });

                page.Footer().AlignCenter().DefaultTextStyle(d => d.FontSize(8)).Text(t => Bi(t, "Thank you for your business!", "እናመሰግናለን!"));
            });
        });

        return document.GeneratePdf();
    }
}