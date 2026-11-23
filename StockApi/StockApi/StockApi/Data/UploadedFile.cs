using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace StockApi.Data;

// A payment screenshot kept in the database, so it survives redeploys of a server with no permanent disk.
[Table("uploaded_files")]
public class UploadedFile
{
    [Key]
    public string Name { get; set; } = "";          // 32 hex characters + .jpg / .png / .webp
    public string ContentType { get; set; } = "";
    public byte[] Data { get; set; } = Array.Empty<byte>();
    public DateTime CreatedAt { get; set; }
}