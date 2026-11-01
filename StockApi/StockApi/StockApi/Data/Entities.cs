namespace StockApi.Data;

public static class Roles
{
    public const string Admin = "Admin";
    public const string Salesperson = "Salesperson";
}

public static class Approval
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}

public class AppUser
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = "";
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = Roles.Salesperson;
    public bool IsActive { get; set; } = true;
    public string ApprovalStatus { get; set; } = Approval.Pending;
    public Guid? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class PasswordResetRequest
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string? NewPasswordHash { get; set; }
    public DateTime RequestedAt { get; set; }
    public string Status { get; set; } = "Pending";
    public Guid? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
}

public class PushSubscription
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Endpoint { get; set; } = "";
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public class Setting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}

public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public class Product
{
    public Guid Id { get; set; }
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
    public decimal CostPrice { get; set; }
    public decimal Price { get; set; }          // without VAT
    public decimal VatAmount { get; set; }
    public decimal PriceWithVat { get; set; }
    public int Quantity { get; set; }           // changed ONLY by stock_movements (DB trigger)
    public int StockedQuantity { get; set; }    // stock level at the last restock
    public bool IsDeleted { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class PaymentMethod
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";      // Cash | MobileBanking | Wallet
    public bool IsActive { get; set; } = true;
    public List<PaymentProvider> Providers { get; set; } = new();
}

public class PaymentProvider
{
    public int Id { get; set; }
    public int PaymentMethodId { get; set; }
    public PaymentMethod? PaymentMethod { get; set; }
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
}

public class StockMovement
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public int ChangeQty { get; set; }
    public string Reason { get; set; } = "";    // Initial | Restock | Adjustment | Damage | Sale
    public Guid? SaleId { get; set; }
    public Guid? SaleItemId { get; set; }
    public Guid? UserId { get; set; }
    public DateTime CreatedAt { get; set; }
}
