using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

[ApiController]
[Route("api/uploads")]
[Authorize]
public class UploadsController(PaymentService payments) : ControllerBase
{
    private const long MaxBytes = 5 * 1024 * 1024;
    private static readonly Regex FileName = new(@"^[0-9a-f]{32}\.(jpg|png|webp)$", RegexOptions.Compiled);

    // Step 1 of an e-payment: upload the screenshot, then send the returned "path" in the payment.
    [HttpPost("payment-proof")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest(new { message = "Choose an image." });
        if (file.Length > MaxBytes) return BadRequest(new { message = "The image is too large (max 5 MB)." });

        // Check the real file type from its first bytes, not the file name
        var h = new byte[12];
        int read;
        await using (var input = file.OpenReadStream())
            read = await input.ReadAsync(h, 0, h.Length);

        string? ext = null;
        if (read >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) ext = "jpg";
        else if (read >= 8 && h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47) ext = "png";
        else if (read >= 12 && h[0] == (byte)'R' && h[1] == (byte)'I' && h[2] == (byte)'F' && h[3] == (byte)'F'
                 && h[8] == (byte)'W' && h[9] == (byte)'E' && h[10] == (byte)'B' && h[11] == (byte)'P') ext = "webp";
        if (ext is null) return BadRequest(new { message = "Only JPG, PNG or WEBP images are allowed." });

        var name = $"{Guid.NewGuid():N}.{ext}";
        var relative = $"payment-proofs/{name}";
        try
        {
            var full = payments.ProofFullPath(relative);
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            await using (var fs = System.IO.File.Create(full))
                await file.CopyToAsync(fs);
            return Ok(new { path = relative });
        }
        catch (Exception ex)
        {
            // Show the real reason (and keep the CORS headers) instead of a blank 500
            return StatusCode(500, new { message = "Could not save the image: " + ex.GetType().Name + " - " + ex.Message });
        }
    }

    // Admin views a screenshot: GET api/uploads/payment-proofs/{file}
    [HttpGet("payment-proofs/{file}")]
    [Authorize(Roles = Roles.Admin)]
    public IActionResult Get(string file)
    {
        if (!FileName.IsMatch(file)) return NotFound();
        var full = payments.ProofFullPath($"payment-proofs/{file}");
        if (!System.IO.File.Exists(full)) return NotFound();

        var type = file.EndsWith(".png") ? "image/png" : file.EndsWith(".webp") ? "image/webp" : "image/jpeg";
        return PhysicalFile(full, type);
    }
}