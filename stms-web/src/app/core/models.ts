export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number; }

export type Role = 'Admin' | 'Salesperson';
export type StockLevel = 'Green' | 'Yellow' | 'Red';

export interface LoginResponse { token: string; fullName: string; role: Role; }
export interface AuthUser { token: string; fullName: string; role: Role; }

export interface User {
  id: string; fullName: string; username: string; role: Role;
  isActive: boolean; approvalStatus: 'Pending' | 'Approved' | 'Rejected'; createdAt: string;
}
export interface PasswordResetRequestItem {
  id: string; userId: string; fullName: string; username: string; requestedAt: string;
}

export interface Product {
  id: string; sku: string; name: string;
  categoryId: number | null; categoryName: string | null;
  costPrice: number | null;            // only the admin receives it
  price: number; vatAmount: number; priceWithVat: number;
  quantity: number; stockedQuantity: number; stockStatus: StockLevel;
}
export interface ProductInput {
  sku: string; name: string; categoryId: number | null; costPrice: number | null; price: number; quantity?: number;
}
export interface ProductCreateInput {
  name: string; categoryId: number | null; costPrice: number | null; price: number; quantity: number;
}

export interface Provider { id: number; name: string; isActive: boolean; }
export interface PaymentMethod {
  id: number; name: string; type: 'Cash' | 'MobileBanking' | 'Wallet'; isActive: boolean;
  requiresProof: boolean; providers: Provider[];
}
export interface PaymentRequest {
  paymentMethodId: number; paymentProviderId?: number | null;
  transactionRef?: string | null; receiptImagePath?: string | null; amount: number;
}
export interface PaymentDraft { valid: boolean; problem: string; request: PaymentRequest | null; }

export interface SaleItem { sku: string; name: string; quantity: number; unitPrice: number; vatAmount: number; lineTotal: number; }
export interface SalePayment {
  id: string; method: string; provider: string | null; transactionRef: string | null;
  amount: number; paidAt: string; isLoanRepayment: boolean; receiptImagePath: string | null;
}
export interface Customer { id: string; fullName: string; phone: string; }
export interface Sale {
  id: string; invoiceNo: string; createdAt: string; salespersonId: string; salesperson: string;
  wantsReceipt: boolean; isLoan: boolean; status: string;
  subtotal: number; vatTotal: number; total: number; amountPaid: number; balance: number;
  customer: Customer | null; items: SaleItem[]; payments: SalePayment[];
}
export interface SaleSummary {
  id: string; invoiceNo: string; createdAt: string; salesperson: string; customer: string | null;
  isLoan: boolean; wantsReceipt: boolean; status: string; itemCount: number;
  total: number | null; amountPaid: number | null;      // null for salespeople
}
export interface CreateSaleRequest {
  items: { productId: string; quantity: number }[];
  wantsReceipt: boolean; isLoan: boolean;
  customer?: { fullName: string; phone: string } | null;
  payments?: PaymentRequest[];
}
export interface CreateSaleResponse { sale: Sale; receiptUrl: string; }

export interface LoanRow {
  id: string; invoiceNo: string; createdAt: string; customerName: string; phone: string;
  total: number; amountPaid: number; balance: number; status: string;
}

export interface SessionSummary {
  sessionId: string | null; state: 'NotStarted' | 'Open' | 'CheckedOut';
  startedAt: string | null; checkedOutAt: string | null;
  transactions: number; itemsSold: number; loanSales: number; loanPaymentsReceived: number;
  paymentsByMethod: { method: string; count: number }[];
}
export interface SalespersonDashboard {
  session: SessionSummary;
  loans: { openCount: number; customersOwing: number };
  stock: { totalProducts: number; lowStock: number; outOfStock: number; level: StockLevel };
  recentSales: { id: string; invoiceNo: string; createdAt: string; isLoan: boolean; status: string; itemCount: number }[];
}

export interface PeriodStats {
  label: string; transactions: number; itemsSold: number;
  subtotal: number; vat: number; sales: number; collected: number; profit: number;
  loanSales: number; loanAmount: number;
}
export type Period = 'day' | 'week' | 'month' | 'year';
export interface AdminDashboard {
  periods: { day: PeriodStats; week: PeriodStats; month: PeriodStats; year: PeriodStats };
  selected: {
    period: Period; from: string; to: string; stats: PeriodStats;
    series: { label: string; sales: number; collected: number }[];
    topProducts: { sku: string; name: string; quantity: number; sales: number; profit: number }[];
    bySalesperson: { id: string; name: string; transactions: number; itemsSold: number; sales: number; profit: number }[];
    byPaymentMethod: { method: string; payments: number; amount: number }[];
  };
  stock: {
    totalProducts: number; totalUnits: number; stockValueAtCost: number;
    lowStock: number; outOfStock: number; level: StockLevel;
    lowItems: { id: string; name: string; sku: string; quantity: number; stockedQuantity: number; status: StockLevel }[];
  };
  loans: { openCount: number; customersOwing: number; outstanding: number };
  todaySessions: { id: string; salesperson: string; startedAt: string; checkedOutAt: string | null }[];
  pendingApprovals: number;
}

export interface StockNotification {
  level: StockLevel; count: number;
  items: { productId: string; name: string; sku: string; quantity: number; stockedQuantity: number; status: StockLevel; message: string }[];
}

export interface ReportSection {
  heading: string | null; headers: string[]; rightAlign: boolean[]; weights: number[];
  rows: string[][]; totals: { label: string; value: string }[];
}
export interface ReportDoc {
  title: string; subtitle: string; generated: string; landscape: boolean;
  sections: ReportSection[]; notes: string[];
}

export interface CompanyInfo { name: string; address: string | null; phone: string | null; tin: string | null; }
export interface CompanySettings { company: CompanyInfo; vatRatePercent: number; }
