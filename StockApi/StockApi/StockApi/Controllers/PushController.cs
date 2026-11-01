using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StockApi.Data;
using StockApi.Services;

namespace StockApi.Controllers;

public record PushSubscriptionRequest(string Endpoint, string P256dh, string Auth);

[ApiController]
[Route("api/push")]
public class PushController(AppDbContext db, WebPushNotificationService notifications) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("vapid-public-key")]
    public IActionResult PublicKey() => string.IsNullOrWhiteSpace(notifications.PublicKey)
        ? StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Push notifications are not configured." })
        : Ok(new { publicKey = notifications.PublicKey });

    [Authorize]
    [HttpPost("subscriptions")]
    public async Task<IActionResult> Subscribe(PushSubscriptionRequest request)
    {
        if (!Uri.TryCreate(request.Endpoint, UriKind.Absolute, out var endpoint) || endpoint.Scheme != Uri.UriSchemeHttps ||
            string.IsNullOrWhiteSpace(request.P256dh) || string.IsNullOrWhiteSpace(request.Auth))
            return BadRequest(new { message = "The browser push subscription is invalid." });

        var userId = User.UserId();
        var existing = await db.PushSubscriptions.FirstOrDefaultAsync(item => item.Endpoint == request.Endpoint);
        if (existing is null)
        {
            db.PushSubscriptions.Add(new PushSubscription
            {
                Id = Guid.NewGuid(), UserId = userId, Endpoint = request.Endpoint,
                P256dh = request.P256dh, Auth = request.Auth
            });
        }
        else
        {
            existing.UserId = userId;
            existing.P256dh = request.P256dh;
            existing.Auth = request.Auth;
        }

        await db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize]
    [HttpDelete("subscriptions")]
    public async Task<IActionResult> Unsubscribe(PushSubscriptionRequest request)
    {
        var userId = User.UserId();
        var existing = await db.PushSubscriptions.FirstOrDefaultAsync(item =>
            item.UserId == userId && item.Endpoint == request.Endpoint);
        if (existing is not null)
        {
            db.PushSubscriptions.Remove(existing);
            await db.SaveChangesAsync();
        }
        return NoContent();
    }
}