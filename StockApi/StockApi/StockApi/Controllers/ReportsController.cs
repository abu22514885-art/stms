using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

// Admin only. Every report: ?format=json (default, for the tables on screen) or ?format=pdf (download).
[ApiController]
[Route("api/reports")]
[Authorize(Roles = Roles.Admin)]
[EnableRateLimiting("heavy")]
public class ReportsController(ReportService reports, ReportPdfService pdf,
    SettingsService settings, TimeService time) : ControllerBase
{
    // Default range: the 1st of this month up to today. At most 5 years.
    private (DateOnly From, DateOnly To)? Range(DateTime? from, DateTime? to, out string? error)
    {
        error = null;
        var today = time.Today();
        var f = from.HasValue ? DateOnly.FromDateTime(from.Value) : new DateOnly(today.Year, today.Month, 1);
        var t = to.HasValue ? DateOnly.FromDateTime(to.Value) : today;
        if (t < f) { error = "The end date is before the start date."; return null; }
        if (t.DayNumber - f.DayNumber > 366 * 5) { error = "Choose a range of 5 years or less."; return null; }
        return (f, t);
    }

    private async Task<IActionResult> Respond(ReportDoc doc, string? format, string fileName)
    {
        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var company = await settings.GetCompanyAsync();
            return File(pdf.Generate(doc, company), "application/pdf", $"{fileName}.pdf");
        }
        return Ok(doc);
    }

    [HttpGet("sales")]
    public async Task<IActionResult> Sales([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? format)
    {
        var r = Range(from, to, out var error);
        if (r is null) return BadRequest(new { message = error });
        var doc = await reports.SalesAsync(r.Value.From, r.Value.To);
        return await Respond(doc, format, $"sales-report-{r.Value.From:yyyyMMdd}-{r.Value.To:yyyyMMdd}");
    }

    [HttpGet("stock")]
    public async Task<IActionResult> Stock([FromQuery] string? format) =>
        await Respond(await reports.StockAsync(), format, "stock-report");

    [HttpGet("loans")]
    public async Task<IActionResult> Loans([FromQuery] string? status, [FromQuery] string? format) =>
        await Respond(await reports.LoansAsync(status ?? "open"), format, "loans-report");

    [HttpGet("performance")]
    public async Task<IActionResult> Performance([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? format)
    {
        var r = Range(from, to, out var error);
        if (r is null) return BadRequest(new { message = error });
        var doc = await reports.PerformanceAsync(r.Value.From, r.Value.To);
        return await Respond(doc, format, $"performance-report-{r.Value.From:yyyyMMdd}-{r.Value.To:yyyyMMdd}");
    }
}
