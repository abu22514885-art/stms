# StockApi setup

## If this is your first time (no StockApi project yet)
1. Check .NET: `dotnet --version` (install the .NET SDK from dotnet.microsoft.com/download if missing)
2. In your STMS folder: `dotnet new webapi -n StockApi --use-controllers` then `cd StockApi`
3. Delete the sample files: `WeatherForecast.cs` and `Controllers\WeatherForecastController.cs`

## Packages (run once)
```
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add package EFCore.NamingConventions
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
dotnet add package BCrypt.Net-Next
dotnet add package QuestPDF
```
If `dotnet --version` starts with 8, add `--version "8.*"` to the first three.

## Put the files in
Extract `StockApi.zip` INTO your StockApi project folder and choose "Replace" when asked.
It contains:
```
Program.cs                 appsettings.json
Data/        Entities.cs  SalesEntities.cs  AppDbContext.cs
Services/    Services.cs  TimeService.cs  SettingsService.cs  SessionService.cs
             PaymentService.cs  SaleReader.cs  ReceiptPdfService.cs  Fmt.cs
             StatsService.cs  ReportService.cs  ReportPdfService.cs
Controllers/ Auth  Products  PaymentConfig  Notifications  Sales  Loans
             Sessions  Dashboard  Uploads  Settings  Reports
api-tests.http
```
Then open `appsettings.json` and set your PostgreSQL password (`YOUR_PASSWORD`) and a new long `Jwt:Key`.
If you already did part 1, your appsettings.json will be replaced: set those two values again.

## Database
Use the newest `schema.sql` (fresh `stms` database). The first start of the API creates the
admin account: username `admin`, password = `Seed:AdminPassword` in appsettings.json.
For an existing database, apply `pwa_notifications.sql` once with `psql` before starting the updated API.

## Cloudinary screenshot storage
Create a free Cloudinary account and copy its cloud name, API key, and API secret from the dashboard. Store them as .NET user-secrets in the API project (do not commit these values):

```powershell
cd StockApi\StockApi\StockApi
dotnet user-secrets init
dotnet user-secrets set "Cloudinary:CloudName" "YOUR_CLOUD_NAME"
dotnet user-secrets set "Cloudinary:ApiKey" "YOUR_API_KEY"
dotnet user-secrets set "Cloudinary:ApiSecret" "YOUR_API_SECRET"
```

Run the API with the `StockApi` launch profile. When all three values are configured, new payment screenshots are uploaded as private Cloudinary assets and served through the admin-only API endpoint. Existing local screenshots remain readable. If Cloudinary is not configured, new screenshots continue to use local storage.

## PWA and push notifications
The Angular service worker is enabled in production builds. Install the app from a secure HTTPS origin; localhost is secure for development only on the same device.
For phone deployments, serve the frontend and API on the same HTTPS origin and reverse-proxy `/api` to the .NET API. Local development continues to use `http://localhost:5000`; a phone must not use its own `localhost` as the API host.

Generate a VAPID key pair locally with `npx --yes web-push generate-vapid-keys`, then store the values with .NET user-secrets in the API project (never commit or share the private key):

```powershell
dotnet user-secrets set "Notifications:VapidPublicKey" "YOUR_PUBLIC_KEY"
dotnet user-secrets set "Notifications:VapidPrivateKey" "YOUR_PRIVATE_KEY"
dotnet user-secrets set "Notifications:VapidSubject" "mailto:you@example.com"
```

After deploying the production PWA and restarting the API, each user can enable browser notifications from the top bar. Push alerts are sent for password-reset requests and admin decisions. The browser must grant notification permission.
In production, configure the same values through the host's secret manager as `Notifications__VapidPublicKey`, `Notifications__VapidPrivateKey`, and `Notifications__VapidSubject`; .NET user-secrets are only loaded in Development.

## Run
`dotnet run`, note the `http://localhost:PORT` it prints, and put it in `api-tests.http` (`@host`).
Test with api-tests.http (VS Code "REST Client" extension, Rider, Visual Studio) or Postman.

## Good to know
- Without Cloudinary credentials, payment screenshots are saved in the `uploads` folder inside
  the project. Back it up and do not commit it to git.
- Dates ("today", check-out) follow `App:TimeZone` in appsettings.json (default Africa/Addis_Ababa).
- Dates in JSON use `DateOnly`, which needs .NET 7 or newer.
- There are no EF migrations: the database comes only from schema.sql.

## Paging and rate limiting (added)

Paging: these lists take `?page=1&pageSize=20` (pageSize at most 100) and return
`{ items, total, page, pageSize, totalPages }`: GET /api/products, /api/sales, /api/loans, /api/users.
Products also take `status=Green|Yellow|Red` and `inStock=true`; the filtering happens in the database.
Reports and dashboards are totals, so they are not paged.

Rate limiting (built in, no extra package). Too many requests get HTTP 429 with a Retry-After header.
Limits per minute are in appsettings.json under "RateLimit":
- PerMinute (240): every client, counted per signed-in user, or per IP address when not signed in
- AuthPerMinute (10): login and register, per IP address (stops password guessing)
- HeavyPerMinute (30): reports and report PDFs, per user
If the API runs behind a proxy (IIS, nginx, a host like Render), all visitors can look like one IP address.
Then add `app.UseForwardedHeaders(...)` so the real address is used.
