using System.Globalization;
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
        c.Background(Colors.Green.Darken4).PaddingHorizontal(7).PaddingVertical(8)
            .DefaultTextStyle(x => x.Bold().FontColor(Colors.White));

    private static IContainer BodyCell(IContainer c) =>
        c.BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2)
            .PaddingHorizontal(7).PaddingVertical(8);

    public byte[] Generate(SaleDto s, CompanyInfo company, decimal vatRatePercent)
    {
        var title = s.WantsReceipt ? "TAX INVOICE / RECEIPT" : "SALES SLIP";
        var vatLabel = vatRatePercent.ToString("0.##", CultureInfo.InvariantCulture);
        var date = time.ToLocal(s.CreatedAt).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.Grey.Darken4));
                page.Background().AlignCenter().AlignMiddle().Rotate(-32)
                    .Text("ATTACHMENT").FontSize(44).Bold().FontColor(Colors.Green.Lighten3);

                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(companyBlock =>
                        {
                            companyBlock.Item().Text(company.Name).FontSize(18).Bold().FontColor(Colors.Green.Darken4);
                            if (!string.IsNullOrWhiteSpace(company.Address))
                                companyBlock.Item().Text(company.Address).FontColor(Colors.Grey.Darken1);
                            if (!string.IsNullOrWhiteSpace(company.Phone))
                                companyBlock.Item().Text($"Tel: {company.Phone}").FontColor(Colors.Grey.Darken1);
                            if (!string.IsNullOrWhiteSpace(company.Tin))
                                companyBlock.Item().Text($"TIN: {company.Tin}").FontColor(Colors.Grey.Darken1);
                        });
                        row.ConstantItem(150).AlignRight().Column(documentBlock =>
                        {
                            documentBlock.Item().AlignRight().Text(title).FontSize(11).Bold().FontColor(Colors.Green.Darken3);
                            documentBlock.Item().PaddingTop(4).AlignRight().Text(s.InvoiceNo).FontSize(13).Bold();
                            documentBlock.Item().AlignRight().Text(date).FontColor(Colors.Grey.Darken1);
                        });
                    });
                    col.Item().PaddingTop(10).LineHorizontal(2).LineColor(Colors.Green.Darken3);
                });

                page.Content().PaddingVertical(12).Column(col =>
                {
                    col.Spacing(10);

                    col.Item().Background(Colors.Grey.Lighten4).Padding(10).Row(row =>
                    {
                        row.RelativeItem().Column(left =>
                        {
                            left.Item().Text($"INVOICE  {s.InvoiceNo}").Bold();
                            left.Item().Text($"ISSUED  {date}").FontColor(Colors.Grey.Darken1);
                            left.Item().Text($"Served by: {s.Salesperson}");
                        });
                        row.RelativeItem().AlignRight().Column(right =>
                        {
                            if (s.Customer is not null)
                            {
                                right.Item().AlignRight().Text(s.Customer.FullName).Bold();
                                right.Item().AlignRight().Text(s.Customer.Phone).FontColor(Colors.Grey.Darken1);
                            }
                            if (s.IsLoan)
                                right.Item().PaddingTop(3).AlignRight().Text("CREDIT SALE / LOAN").Bold().FontColor(Colors.Orange.Darken2);
                        });
                    });

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(5);
                            cols.ConstantColumn(34);
                            cols.RelativeColumn(2);
                            cols.RelativeColumn(1.5f);
                            cols.RelativeColumn(2);
                        });

                        table.Header(h =>
                        {
                            h.Cell().Element(HeadCell).Text("Item");
                            h.Cell().Element(HeadCell).AlignRight().Text("Qty");
                            h.Cell().Element(HeadCell).AlignRight().Text("Unit price");
                            h.Cell().Element(HeadCell).AlignRight().Text("VAT");
                            h.Cell().Element(HeadCell).AlignRight().Text("Amount");
                        });

                        for (var index = 0; index < s.Items.Count; index++)
                        {
                            var it = s.Items[index];
                            table.Cell().Element(BodyCell).Text(it.Name);
                            table.Cell().Element(BodyCell).AlignRight().Text(it.Quantity.ToString(CultureInfo.InvariantCulture));
                            table.Cell().Element(BodyCell).AlignRight().Text(Money(it.UnitPrice));
                            table.Cell().Element(BodyCell).AlignRight().Text(Money(it.VatAmount));
                            table.Cell().Element(BodyCell).AlignRight().Text(Money(it.LineTotal)).Bold();
                        }
                    });

                    col.Item().AlignRight().Width(230).Column(t =>
                    {
                        t.Spacing(4);
                        t.Item().Row(row =>
                        {
                            row.RelativeItem().Text("Subtotal");
                            row.ConstantItem(95).AlignRight().Text(Money(s.Subtotal));
                        });
                        if (s.WantsReceipt)
                            t.Item().Row(row =>
                            {
                                row.RelativeItem().Text($"VAT ({vatLabel}%)");
                                row.ConstantItem(95).AlignRight().Text(Money(s.VatTotal));
                            });
                        t.Item().BorderTop(1).BorderColor(Colors.Green.Darken3).PaddingTop(7).Row(row =>
                        {
                            row.RelativeItem().Text("TOTAL").FontSize(12).Bold().FontColor(Colors.Green.Darken4);
                            row.ConstantItem(95).AlignRight().Text(Money(s.Total)).FontSize(12).Bold().FontColor(Colors.Green.Darken4);
                        });
                        t.Item().Row(row =>
                        {
                            row.RelativeItem().Text("Paid");
                            row.ConstantItem(95).AlignRight().Text(Money(s.AmountPaid));
                        });
                        if (s.Balance > 0)
                            t.Item().PaddingTop(3).Row(row =>
                            {
                                row.RelativeItem().Text("BALANCE DUE").Bold().FontColor(Colors.Orange.Darken2);
                                row.ConstantItem(95).AlignRight().Text(Money(s.Balance)).Bold().FontColor(Colors.Orange.Darken2);
                            });
                    });

                    if (s.Payments.Count > 0)
                    {
                        col.Item().Column(payments =>
                        {
                            payments.Item().PaddingBottom(4).Text("PAYMENTS RECEIVED").FontSize(8).Bold().FontColor(Colors.Grey.Darken1);
                            payments.Item().Table(table =>
                            {
                                table.ColumnsDefinition(cols =>
                                {
                                    cols.RelativeColumn(3);
                                    cols.RelativeColumn(2);
                                    cols.RelativeColumn(2);
                                });
                                table.Header(header =>
                                {
                                    header.Cell().Element(HeadCell).Text("Method");
                                    header.Cell().Element(HeadCell).Text("Reference");
                                    header.Cell().Element(HeadCell).AlignRight().Text("Amount");
                                });
                                foreach (var pay in s.Payments)
                                {
                                    var how = pay.Provider is null ? pay.Method : $"{pay.Method} - {pay.Provider}";
                                    table.Cell().Element(BodyCell).Text(how);
                                    table.Cell().Element(BodyCell).Text(pay.TransactionRef ?? "-");
                                    table.Cell().Element(BodyCell).AlignRight().Text(Money(pay.Amount));
                                }
                            });
                        });
                    }
                });

                page.Footer().PaddingTop(8).Column(footer =>
                {
                    footer.Item().LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);
                    footer.Item().PaddingTop(6).AlignCenter().Text("Thank you for your business").FontSize(8).FontColor(Colors.Grey.Darken1);
                });
            });
        });

        return document.GeneratePdf();
    }
}
