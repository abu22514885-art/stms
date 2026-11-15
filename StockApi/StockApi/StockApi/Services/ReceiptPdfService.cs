using System.Globalization;
using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace StockApi.Services;

// Builds the printable receipt handed to the customer.
// With VAT (customer wants a receipt) it is a "TAX INVOICE / RECEIPT", otherwise a "SALES SLIP".
public class ReceiptPdfService(TimeService time)
{
    private static string Money(decimal v) => v.ToString("N2", CultureInfo.InvariantCulture);

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
        var inv = CultureInfo.InvariantCulture;
        var qrText = string.Join("|", "INV", s.InvoiceNo, company.Tin ?? "",
            s.CreatedAt.ToString("yyyyMMddHHmm", inv),
            s.Subtotal.ToString("F2", inv), (s.WantsReceipt ? s.VatTotal : 0m).ToString("F2", inv), s.Total.ToString("F2", inv));
        var qrPng = Qr(qrText);

        var title = s.WantsReceipt ? "TAX INVOICE / RECEIPT" : "SALES SLIP";
        var vatLabel = vatRatePercent.ToString("0.##", CultureInfo.InvariantCulture);
        var date = time.ToLocal(s.CreatedAt).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);

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
                        col.Item().AlignCenter().Text($"Tel: {company.Phone}");
                    if (!string.IsNullOrWhiteSpace(company.Tin))
                        col.Item().AlignCenter().Text($"TIN: {company.Tin}");
                    col.Item().PaddingTop(6).AlignCenter().Text(title).FontSize(12).Bold();
                });

                page.Content().PaddingVertical(8).Column(col =>
                {
                    col.Spacing(8);

                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(left =>
                        {
                            left.Item().Text($"Invoice No: {s.InvoiceNo}");
                            left.Item().Text($"Date: {date}");
                            left.Item().Text($"Served by: {s.Salesperson}");
                        });
                        row.RelativeItem().AlignRight().Column(right =>
                        {
                            if (s.Customer is not null)
                            {
                                right.Item().AlignRight().Text($"Customer: {s.Customer.FullName}");
                                right.Item().AlignRight().Text($"Phone: {s.Customer.Phone}");
                            }
                            if (s.IsLoan)
                                right.Item().AlignRight().Text("CREDIT SALE (LOAN)").Bold();
                        });
                    });

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(5);
                            cols.ConstantColumn(32);
                            cols.RelativeColumn(2);
                            cols.RelativeColumn(2);
                        });

                        table.Header(h =>
                        {
                            h.Cell().Element(HeadCell).Text("Item");
                            h.Cell().Element(HeadCell).AlignRight().Text("Qty");
                            h.Cell().Element(HeadCell).AlignRight().Text("Unit price");
                            h.Cell().Element(HeadCell).AlignRight().Text("Amount");
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
                        t.Item().AlignRight().Text($"Subtotal: {Money(s.Subtotal)}");
                        if (s.WantsReceipt)
                            t.Item().AlignRight().Text($"VAT ({vatLabel}%): {Money(s.VatTotal)}");
                        t.Item().AlignRight().Text($"TOTAL: {Money(s.Total)}").FontSize(12).Bold();
                        t.Item().AlignRight().Text($"Paid: {Money(s.AmountPaid)}");
                        if (s.Balance > 0)
                            t.Item().AlignRight().Text($"BALANCE DUE: {Money(s.Balance)}").Bold();
                    });

                    if (s.Payments.Count > 0)
                    {
                        col.Item().Column(p =>
                        {
                            p.Item().Text("Payment").Bold();
                            foreach (var pay in s.Payments)
                            {
                                var how = pay.Provider is null ? pay.Method : $"{pay.Method} - {pay.Provider}";
                                var refText = string.IsNullOrEmpty(pay.TransactionRef) ? "" : $"  (Ref: {pay.TransactionRef})";
                                p.Item().Text($"{how}: {Money(pay.Amount)}{refText}");
                            }
                        });
                    }

                    // Invoice QR code (scan to compare the invoice number, TIN, date and amounts)
                    col.Item().AlignCenter().Column(q =>
                    {
                        q.Item().AlignCenter().Width(80).Image(qrPng);
                        q.Item().AlignCenter().Text("Scan to check this invoice").FontSize(7);
                    });
                });

                page.Footer().AlignCenter().Text("Thank you for your business!").FontSize(8);
            });
        });

        return document.GeneratePdf();
    }
}