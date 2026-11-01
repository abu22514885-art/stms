using Microsoft.EntityFrameworkCore;

namespace StockApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<PasswordResetRequest> PasswordResetRequests => Set<PasswordResetRequest>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<PaymentMethod> PaymentMethods => Set<PaymentMethod>();
    public DbSet<PaymentProvider> PaymentProviders => Set<PaymentProvider>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<SalesSession> SalesSessions => Set<SalesSession>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<Payment> Payments => Set<Payment>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Setting>().HasKey(x => x.Key);

        // Deleted products are hidden everywhere (soft delete)
        b.Entity<Product>().HasQueryFilter(p => !p.IsDeleted);

        // Invoice numbers come from the invoice_seq sequence (column default in PostgreSQL)
        b.Entity<Sale>().Property(s => s.InvoiceNo).HasDefaultValueSql("nextval('invoice_seq')");

        // Relationships (tells EF the insert order: sale first, then items/payments/movements)
        b.Entity<Sale>().HasMany(s => s.Items).WithOne().HasForeignKey(i => i.SaleId);
        b.Entity<Sale>().HasMany(s => s.Payments).WithOne().HasForeignKey(p => p.SaleId);
        b.Entity<Sale>().HasOne(s => s.Salesperson).WithMany().HasForeignKey(s => s.SalespersonId);
        b.Entity<Sale>().HasOne(s => s.Customer).WithMany().HasForeignKey(s => s.CustomerId);
        b.Entity<Sale>().HasOne<SalesSession>().WithMany().HasForeignKey(s => s.SessionId);
        b.Entity<Payment>().HasOne(p => p.PaymentMethod).WithMany().HasForeignKey(p => p.PaymentMethodId);
        b.Entity<Payment>().HasOne(p => p.PaymentProvider).WithMany().HasForeignKey(p => p.PaymentProviderId);
        b.Entity<StockMovement>().HasOne<Sale>().WithMany().HasForeignKey(m => m.SaleId);
        b.Entity<StockMovement>().HasOne<SaleItem>().WithMany().HasForeignKey(m => m.SaleItemId);

        // Let PostgreSQL fill ids and timestamps
        foreach (var et in b.Model.GetEntityTypes().ToList())
        {
            foreach (var p in et.GetProperties().ToList())
            {
                if (p.Name is "CreatedAt" or "UpdatedAt")
                    b.Entity(et.ClrType).Property(p.Name).HasDefaultValueSql("now()");
                else if (p.Name == "Id" && p.ClrType == typeof(Guid))
                    b.Entity(et.ClrType).Property(p.Name).HasDefaultValueSql("gen_random_uuid()");
            }
        }
    }
}
