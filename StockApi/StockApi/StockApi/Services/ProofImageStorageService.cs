using System.Text.RegularExpressions;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;

namespace StockApi.Services;

public class ProofImageStorageService
{
    private const string CloudPathPrefix = "payment-proofs/cloudinary/";
    private static readonly Regex LocalPath = new(@"^payment-proofs/[0-9a-f]{32}\.(jpg|png|webp)$", RegexOptions.Compiled);
    private static readonly Regex CloudPath = new(@"^payment-proofs/cloudinary/[0-9a-f]{32}\.(jpg|png|webp)$", RegexOptions.Compiled);

    private readonly string uploadsRoot;
    private readonly Cloudinary? cloudinary;
    private readonly HttpClient httpClient;

    public ProofImageStorageService(IConfiguration configuration, IWebHostEnvironment environment, IHttpClientFactory clients)
    {
        uploadsRoot = Path.Combine(environment.ContentRootPath, "uploads");
        httpClient = clients.CreateClient();

        var cloudName = configuration["Cloudinary:CloudName"];
        var apiKey = configuration["Cloudinary:ApiKey"];
        var apiSecret = configuration["Cloudinary:ApiSecret"];
        if (!string.IsNullOrWhiteSpace(cloudName) && !string.IsNullOrWhiteSpace(apiKey) && !string.IsNullOrWhiteSpace(apiSecret))
        {
            cloudinary = new Cloudinary(new Account(cloudName, apiKey, apiSecret));
            cloudinary.Api.Secure = true;
        }
    }

    public static bool IsValidPath(string path) => LocalPath.IsMatch(path) || CloudPath.IsMatch(path);

    public async Task<string> SaveAsync(IFormFile file, string extension)
    {
        var id = Guid.NewGuid().ToString("N");
        if (cloudinary is not null)
        {
            await using var input = file.OpenReadStream();
            var result = await cloudinary.UploadAsync(new ImageUploadParams
            {
                File = new FileDescription(file.FileName, input),
                PublicId = $"payment-proofs/{id}",
                Type = "private",
                Overwrite = false
            });
            if (result.Error is not null)
                throw new InvalidOperationException("Cloudinary rejected the receipt image.");

            return $"{CloudPathPrefix}{id}.{extension}";
        }

        var relative = $"payment-proofs/{id}.{extension}";
        var full = Path.Combine(uploadsRoot, relative.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await using (var output = File.Create(full))
            await file.CopyToAsync(output);
        return relative;
    }

    public async Task<bool> ExistsAsync(string path)
    {
        if (CloudPath.IsMatch(path))
        {
            if (cloudinary is null) return false;
            using var response = await httpClient.GetAsync(PrivateUrl(path), HttpCompletionOption.ResponseHeadersRead);
            return response.IsSuccessStatusCode;
        }

        if (!LocalPath.IsMatch(path)) return false;
        var full = Path.Combine(uploadsRoot, path.Replace('/', Path.DirectorySeparatorChar));
        return File.Exists(full);
    }

    public async Task<(byte[] Content, string ContentType)?> ReadAsync(string path)
    {
        if (CloudPath.IsMatch(path))
        {
            if (cloudinary is null) return null;
            using var response = await httpClient.GetAsync(PrivateUrl(path));
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
            response.EnsureSuccessStatusCode();
            var contentType = response.Content.Headers.ContentType?.MediaType ?? ContentType(path);
            return (await response.Content.ReadAsByteArrayAsync(), contentType);
        }

        if (!LocalPath.IsMatch(path)) return null;
        var full = Path.Combine(uploadsRoot, path.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(full)) return null;
        return (await File.ReadAllBytesAsync(full), ContentType(path));
    }

    private string PrivateUrl(string path)
    {
        var file = Path.GetFileName(path);
        var extension = Path.GetExtension(file);
        var publicId = $"payment-proofs/{Path.GetFileNameWithoutExtension(file)}{extension}";
        return cloudinary!.Api.UrlImgUp.Type("private").Signed(true).BuildUrl(publicId);
    }

    private static string ContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".webp" => "image/webp",
        _ => "image/jpeg"
    };
}