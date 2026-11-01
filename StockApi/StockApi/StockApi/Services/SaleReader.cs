using Microsoft.EntityFrameworkCore;
using StockApi.Data;

namespace StockApi.Services;

public record SaleItemDto(string Sku, string Name, int Quantity, decimal UnitPrice, decimal VatAmount, decimal LineTotal);
public record PaymentDto(Guid Id, string Method, string? Provider, string? TransactionRef,
    decimal Amount, DateTime PaidAt, bool IsLoanRepayment, string? ReceiptImagePath);
public record CustomerDto(Guid Id, string FullName, string Phone);
public record SaleDto(Guid Id, string InvoiceNo, DateTime CreatedAt, Guid SalespersonId, string Salesperson,
    bool WantsReceipt, bool IsLoan, string Status,
    decimal Subtotal, decimal VatTotal, decimal Total, decimal AmountPaid, decimal Balance,
    CustomerDto? Customer, List<SaleItemDto> Items, List<PaymentDto> Payments);

public class SaleReader(AppDbContext db)
{
    // Screenshot paths are only given to the admin
    public async Task<SaleDto?> GetAsync(Guid id, bool admin)
    {
        var s = await db.Sales.AsNoTracking().AsSplitQuery()
            .Include(x => x.Items)
            .Include(x => x.Payments).ThenInclude(p => p.PaymentMethod)
            .Include(x => x.Payments).ThenInclude(p => p.PaymentProvider)
            .Include(x => x.Customer)
            .Include(x => x.Salesperson)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return null;

        return new SaleDto(
            s.Id, s.InvoiceNo, s.CreatedAt, s.SalespersonId, s.Salesperson?.FullName ?? "",
            s.WantsReceipt, s.IsLoan, s.Status,
            s.Subtotal, s.VatTotal, s.Total, s.AmountPaid, s.Total - s.AmountPaid,
            s.Customer is null ? null : new CustomerDto(s.Customer.Id, s.Customer.FullName, s.Customer.Phone),
            s.Items.OrderBy(i => i.ProductName)
                .Select(i => new SaleItemDto(i.ProductSku, i.ProductName, i.Quantity, i.UnitPrice, i.VatAmount, i.LineTotal))
                .ToList(),
            s.Payments.OrderBy(p => p.PaidAt)
                .Select(p => new PaymentDto(p.Id, p.PaymentMethod?.Name ?? "", p.PaymentProvider?.Name,
                    p.TransactionRef, p.Amount, p.PaidAt, p.IsLoanRepayment, admin ? p.ReceiptImagePath : null))
                .ToList());
    }
}
