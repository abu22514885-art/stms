using Microsoft.EntityFrameworkCore;
using StockApi.Data;

namespace StockApi.Services;

public record PaymentRequest(int PaymentMethodId, int? PaymentProviderId,
    string? TransactionRef, string? ReceiptImagePath, decimal Amount);

public class PaymentService(AppDbContext db, ProofImageStorageService proofStorage)
{
    // Validates payment lines and turns them into Payment rows (SaleId is set by the caller).
    // Cash: no extras. Mobile banking / wallet: provider + transaction reference + screenshot.
    public async Task<(List<Payment>? Payments, string? Error)> BuildAsync(
        IEnumerable<PaymentRequest> requests, Guid userId, bool isRepayment)
    {
        var methods = await db.PaymentMethods.AsNoTracking().ToListAsync();
        var providers = await db.PaymentProviders.AsNoTracking().ToListAsync();
        var refsInRequest = new HashSet<string>();
        var imagesInRequest = new HashSet<string>();
        var result = new List<Payment>();

        foreach (var r in requests)
        {
            var amount = Math.Round(r.Amount, 2, MidpointRounding.AwayFromZero);
            if (amount <= 0) return (null, "Payment amount must be greater than 0.");

            var method = methods.FirstOrDefault(m => m.Id == r.PaymentMethodId && m.IsActive);
            if (method is null) return (null, "Choose a valid payment method.");

            var pay = new Payment
            {
                Id = Guid.NewGuid(), PaymentMethodId = method.Id, Amount = amount,
                ReceivedBy = userId, PaidAt = DateTime.UtcNow, IsLoanRepayment = isRepayment
            };

            if (method.Type != "Cash")
            {
                var provider = providers.FirstOrDefault(p =>
                    p.Id == r.PaymentProviderId && p.PaymentMethodId == method.Id && p.IsActive);
                if (provider is null) return (null, $"Choose the bank or wallet used for {method.Name}.");

                var txRef = r.TransactionRef?.Trim().ToUpperInvariant();
                if (string.IsNullOrEmpty(txRef)) return (null, "Transaction reference ID is required.");
                if (txRef.Length > 100) return (null, "Transaction reference ID is too long.");

                var image = r.ReceiptImagePath?.Trim();
                if (string.IsNullOrEmpty(image) || !await proofStorage.ExistsAsync(image))
                    return (null, "Upload the receipt screenshot for this payment.");

                if (!refsInRequest.Add($"{provider.Id}:{txRef}") || !imagesInRequest.Add(image))
                    return (null, "The same reference or screenshot is used twice in this payment.");

                if (await db.Payments.AnyAsync(p => p.PaymentProviderId == provider.Id && p.TransactionRef == txRef))
                    return (null, "This transaction reference was already used.");
                if (await db.Payments.AnyAsync(p => p.ReceiptImagePath == image))
                    return (null, "This screenshot was already used for another payment.");

                pay.PaymentProviderId = provider.Id;
                pay.TransactionRef = txRef;
                pay.ReceiptImagePath = image;
            }
            result.Add(pay);
        }
        return (result, null);
    }
}
