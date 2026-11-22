using System.ComponentModel.DataAnnotations.Schema;

namespace StockApi.Data;

// One penalty month on one loan (never edited; see loan_penalties in credit_management.sql)
[Table("loan_penalties")]
public class LoanPenalty
{
    public Guid Id { get; set; }
    public Guid SaleId { get; set; }
    public int PeriodNo { get; set; }
    public DateOnly PeriodStart { get; set; }
    public decimal BalanceBase { get; set; }
    public decimal Rate { get; set; }
    public decimal Amount { get; set; }
    public DateTime CreatedAt { get; set; }
}

// "Remind the customer" step already raised for a loan (d-3, d+0, d+5 ...)
[Table("loan_reminders")]
public class LoanReminder
{
    public Guid Id { get; set; }
    public Guid SaleId { get; set; }
    public string Kind { get; set; } = "";
    public int DueOffset { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DoneAt { get; set; }
    public Guid? DoneBy { get; set; }
}