using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StockApi.Data;
using StockApi.Services;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

// Render gives the database address as postgres://user:password@host/db. Npgsql needs key=value text, so convert it.
// A normal "Host=...;Database=..." string is used as it is.
static string NormalizeConnection(string? raw)
{
    if (string.IsNullOrWhiteSpace(raw)) return "";
    // Pasted values often carry spaces, line breaks or surrounding quotes
    raw = raw.Trim().Trim('"', '\'').Trim();
    if (!raw.StartsWith("postgres://") && !raw.StartsWith("postgresql://")) return raw;
    var u = new Uri(raw);
    var user = u.UserInfo.Split(':', 2);
    return $"Host={u.Host};Port={(u.Port > 0 ? u.Port : 5432)};Database={u.AbsolutePath.TrimStart('/')};" +
           $"Username={Uri.UnescapeDataString(user[0])};Password={Uri.UnescapeDataString(user.Length > 1 ? user[1] : "")};" +
           "SSL Mode=Prefer;Trust Server Certificate=true";
}

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(NormalizeConnection(cfg.GetConnectionString("Default"))).UseSnakeCaseNamingConvention());

builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<VatService>();
builder.Services.AddSingleton<TimeService>();
builder.Services.AddScoped<SessionService>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<SaleReader>();
builder.Services.AddScoped<SettingsService>();
builder.Services.AddScoped<ReceiptPdfService>();
builder.Services.AddScoped<StatsService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<ReportPdfService>();

QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = cfg["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = cfg["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg["Jwt:Key"]!)),
            NameClaimType = "name",
            RoleClaimType = "role",
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddAuthorization();

// Websites allowed to call the API. Local default below; on the server set Cors__Origins to the Netlify address
// (several addresses can be separated with commas, no trailing slash).
var corsOrigins = (cfg["Cors:Origins"] ?? "http://localhost:4200")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(o => o.AddPolicy("web", p =>
    p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));

// Behind Render's proxy: use the visitor's real IP address (needed by the rate limiter)
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

builder.Services.AddControllers();

// Rate limiting: too many requests get HTTP 429 with a Retry-After header.
//  - every client: PerMinute requests a minute (by user when signed in, otherwise by IP address)
//  - login / register: AuthPerMinute a minute per IP address (stops password guessing)
//  - reports and PDFs: HeavyPerMinute a minute per user
var perMinute = cfg.GetValue("RateLimit:PerMinute", 240);
var authPerMinute = cfg.GetValue("RateLimit:AuthPerMinute", 10);
var heavyPerMinute = cfg.GetValue("RateLimit:HeavyPerMinute", 30);

static string ClientKey(HttpContext c) =>
    c.User.Identity?.IsAuthenticated == true
        ? "u:" + (c.User.FindFirst("sub")?.Value ?? "?")
        : "ip:" + (c.Connection.RemoteIpAddress?.ToString() ?? "?");

static FixedWindowRateLimiterOptions Window(int permits) => new()
{
    PermitLimit = permits,
    Window = TimeSpan.FromMinutes(1),
    QueueLimit = 0,
    AutoReplenishment = true
};

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(c =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(c), _ => Window(perMinute)));
    o.AddPolicy("auth", c => RateLimitPartition.GetFixedWindowLimiter(
        "ip:" + (c.Connection.RemoteIpAddress?.ToString() ?? "?"), _ => Window(authPerMinute)));
    o.AddPolicy("heavy", c => RateLimitPartition.GetFixedWindowLimiter(ClientKey(c), _ => Window(heavyPerMinute)));
    o.OnRejected = async (ctx, ct) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var wait))
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)wait.TotalSeconds).ToString();
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsync("{\"message\":\"Too many requests. Please wait a moment and try again.\"}", ct);
    };
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DbSeeder.SeedAdminAsync(db, cfg);
}

app.UseForwardedHeaders();
app.UseCors("web");
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapControllers();
app.Run();