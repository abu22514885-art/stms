using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

[ApiController]
[Route("api/uploads")]
[Authorize]
public class UploadsController(ProofImageStorageService proofStorage) : ControllerBase
{
    private const long MaxBytes = 5 * 1024 * 1024;

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

        var relative = await proofStorage.SaveAsync(file, ext);
        return Ok(new { path = relative });
    }

    // Admin views a screenshot: GET api/uploads/payment-proofs/{file}
    [HttpGet("payment-proofs/{*file}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Get(string file)
    {
        var path = $"payment-proofs/{file}";
        if (!ProofImageStorageService.IsValidPath(path)) return NotFound();
        var image = await proofStorage.ReadAsync(path);
        return image is null ? NotFound() : File(image.Value.Content, image.Value.ContentType);
    }
}
