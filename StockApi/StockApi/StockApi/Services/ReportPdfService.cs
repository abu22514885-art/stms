using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace StockApi.Services;

// Prints any ReportDoc as a PDF
public class ReportPdfService
{
    private static IContainer HeadCell(IContainer c) =>
        c.Background(Colors.Grey.Lighten3).BorderBottom(1).PaddingVertical(3).PaddingHorizontal(2)
         .DefaultTextStyle(x => x.Bold());

    private static IContainer BodyCell(IContainer c) =>
        c.BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).PaddingVertical(2).PaddingHorizontal(2);

    public byte[] Generate(ReportDoc doc, CompanyInfo company)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(doc.Landscape ? PageSizes.A4.Landscape() : PageSizes.A4);
                page.Margin(26);
                page.DefaultTextStyle(x => x.FontSize(8.5f));

                page.Header().Column(col =>
                {
                    col.Item().Text(company.Name).FontSize(14).Bold();
                    col.Item().Text(doc.Title).FontSize(12).Bold();
                    col.Item().Text(doc.Subtitle);
                    col.Item().PaddingBottom(6).Text($"Generated: {doc.Generated}").FontSize(7.5f);
                });

                page.Content().Column(col =>
                {
                    col.Spacing(10);

                    foreach (var section in doc.Sections)
                    {
                        col.Item().Column(sc =>
                        {
                            sc.Spacing(4);
                            if (!string.IsNullOrWhiteSpace(section.Heading))
                                sc.Item().Text(section.Heading).FontSize(10).Bold();

                            if (section.Rows.Count == 0)
                            {
                                sc.Item().Text("No data for this period.");
                            }
                            else
                            {
                                sc.Item().Table(table =>
                                {
                                    table.ColumnsDefinition(cols =>
                                    {
                                        foreach (var w in section.Weights) cols.RelativeColumn(w);
                                    });

                                    table.Header(h =>
                                    {
                                        for (var i = 0; i < section.Headers.Count; i++)
                                        {
                                            var cell = h.Cell().Element(HeadCell);
                                            if (section.RightAlign[i]) cell.AlignRight().Text(section.Headers[i]);
                                            else cell.Text(section.Headers[i]);
                                        }
                                    });

                                    foreach (var row in section.Rows)
                                    {
                                        for (var i = 0; i < row.Count; i++)
                                        {
                                            var cell = table.Cell().Element(BodyCell);
                                            if (section.RightAlign[i]) cell.AlignRight().Text(row[i]);
                                            else cell.Text(row[i]);
                                        }
                                    }
                                });
                            }

                            if (section.Totals.Count > 0)
                            {
                                sc.Item().PaddingTop(4).AlignRight().Column(t =>
                                {
                                    foreach (var total in section.Totals)
                                        t.Item().AlignRight().Text($"{total.Label}: {total.Value}").Bold();
                                });
                            }
                        });
                    }

                    foreach (var note in doc.Notes)
                        col.Item().Text(note).FontSize(7.5f).Italic();
                });

                page.Footer().AlignCenter().Text(t =>
                {
                    t.Span("Page ");
                    t.CurrentPageNumber();
                    t.Span(" of ");
                    t.TotalPages();
                });
            });
        });

        return document.GeneratePdf();
    }
}
