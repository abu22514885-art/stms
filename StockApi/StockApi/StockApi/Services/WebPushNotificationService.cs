using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;
using WebPush;
using StoredPushSubscription = StockApi.Data.PushSubscription;

namespace StockApi.Services;

public class WebPushNotificationService(AppDbContext db, IConfiguration configuration, ILogger<WebPushNotificationService> logger)
{
    public string? PublicKey => configuration["Notifications:VapidPublicKey"];

    public async Task SendToAdminsAsync(string title, string body, string url)
    {
        var ids = await db.Users.AsNoTracking().Where(user => user.Role == Roles.Admin)
            .Select(user => user.Id).ToListAsync();
        await SendAsync(ids, title, body, url);
    }

    public Task SendToUserAsync(Guid userId, string title, string body, string url) =>
        SendAsync(new[] { userId }, title, body, url);

    private async Task SendAsync(IEnumerable<Guid> userIds, string title, string body, string url)
    {
        var publicKey = configuration["Notifications:VapidPublicKey"];
        var privateKey = configuration["Notifications:VapidPrivateKey"];
        var subject = configuration["Notifications:VapidSubject"];
        if (string.IsNullOrWhiteSpace(publicKey) || string.IsNullOrWhiteSpace(privateKey) || string.IsNullOrWhiteSpace(subject))
            return;

        var ids = userIds.Distinct().ToArray();
        var subscriptions = await db.PushSubscriptions.Where(subscription => ids.Contains(subscription.UserId)).ToListAsync();
        if (subscriptions.Count == 0) return;

        var client = new WebPushClient();
        var details = new VapidDetails(subject, publicKey, privateKey);
        var payload = JsonSerializer.Serialize(new
        {
            notification = new
            {
                title,
                body,
                icon = "/icons/icon-192x192.png",
                badge = "/icons/icon-96x96.png",
                data = new { url }
            }
        });
        var expired = new List<StoredPushSubscription>();

        foreach (var subscription in subscriptions)
        {
            try
            {
                await client.SendNotificationAsync(
                    new WebPush.PushSubscription(subscription.Endpoint, subscription.P256dh, subscription.Auth),
                    payload, details);
            }
            catch (WebPushException ex) when (ex.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound)
            {
                expired.Add(subscription);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not deliver a browser push notification.");
            }
        }

        if (expired.Count > 0)
        {
            db.PushSubscriptions.RemoveRange(expired);
            await db.SaveChangesAsync();
        }
    }
}