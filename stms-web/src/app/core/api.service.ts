import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from './config';
import {
  AdminDashboard, Paged, CompanyInfo, CompanySettings, CreateSaleRequest, CreateSaleResponse, LoanRow,
  PasswordResetRequestItem, PaymentMethod, PaymentRequest, Period, Product, ProductCreateInput, ProductInput, ReportDoc, Sale, SalespersonDashboard,
  SaleSummary, SessionSummary, StockNotification, User
} from './models';

function params(obj: Record<string, string | number | boolean | null | undefined>): HttpParams {
  let p = new HttpParams();
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private url(path: string): string { return `${API_URL}${path}`; }

  // ---- accounts
  register(fullName: string, username: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.url('/api/auth/register'), { fullName, username, password });
  }
  users(status: string | undefined, page: number, pageSize: number): Observable<Paged<User>> {
    return this.http.get<Paged<User>>(this.url('/api/users'), { params: params({ status, page, pageSize }) });
  }
  approveUser(id: string): Observable<unknown> { return this.http.post(this.url(`/api/users/${id}/approve`), {}); }
  rejectUser(id: string): Observable<unknown> { return this.http.post(this.url(`/api/users/${id}/reject`), {}); }
  toggleUser(id: string): Observable<unknown> { return this.http.post(this.url(`/api/users/${id}/toggle-active`), {}); }
  vapidPublicKey(): Observable<{ publicKey: string }> {
    return this.http.get<{ publicKey: string }>(this.url('/api/push/vapid-public-key'));
  }
  savePushSubscription(subscription: { endpoint: string; p256dh: string; auth: string }): Observable<void> {
    return this.http.post<void>(this.url('/api/push/subscriptions'), subscription);
  }
  removePushSubscription(subscription: { endpoint: string; p256dh: string; auth: string }): Observable<void> {
    return this.http.delete<void>(this.url('/api/push/subscriptions'), { body: subscription });
  }
  passwordResetRequests(): Observable<PasswordResetRequestItem[]> {
    return this.http.get<PasswordResetRequestItem[]>(this.url('/api/users/password-reset-requests'));
  }
  approvePasswordReset(id: string): Observable<unknown> {
    return this.http.post(this.url(`/api/users/password-reset-requests/${id}/approve`), {});
  }
  rejectPasswordReset(id: string): Observable<unknown> {
    return this.http.post(this.url(`/api/users/password-reset-requests/${id}/reject`), {});
  }

  // ---- products and stock
  products(q: { search?: string; status?: string; inStock?: boolean; page: number; pageSize: number }): Observable<Paged<Product>> {
    return this.http.get<Paged<Product>>(this.url('/api/products'), { params: params(q) });
  }
  createProduct(p: ProductCreateInput): Observable<Product> { return this.http.post<Product>(this.url('/api/products'), p); }
  updateProduct(id: string, p: ProductInput): Observable<Product> { return this.http.put<Product>(this.url(`/api/products/${id}`), p); }
  deleteProduct(id: string): Observable<unknown> { return this.http.delete(this.url(`/api/products/${id}`)); }
  restock(id: string, quantity: number): Observable<Product> {
    return this.http.post<Product>(this.url(`/api/products/${id}/restock`), { quantity });
  }
  adjustStock(id: string, quantity: number, reason: string): Observable<Product> {
    return this.http.post<Product>(this.url(`/api/products/${id}/adjust`), { quantity, reason });
  }
  lowStock(): Observable<StockNotification> { return this.http.get<StockNotification>(this.url('/api/notifications/low-stock')); }

  // ---- payment configuration
  paymentMethods(): Observable<PaymentMethod[]> { return this.http.get<PaymentMethod[]>(this.url('/api/payment-methods')); }
  addProvider(paymentMethodId: number, name: string): Observable<unknown> {
    return this.http.post(this.url('/api/payment-methods/providers'), { paymentMethodId, name, isActive: true });
  }
  updateProvider(id: number, paymentMethodId: number, name: string, isActive: boolean): Observable<unknown> {
    return this.http.put(this.url(`/api/payment-methods/providers/${id}`), { paymentMethodId, name, isActive });
  }
  deleteProvider(id: number): Observable<unknown> { return this.http.delete(this.url(`/api/payment-methods/providers/${id}`)); }

  // ---- sales
  createSale(req: CreateSaleRequest): Observable<CreateSaleResponse> {
    return this.http.post<CreateSaleResponse>(this.url('/api/sales'), req);
  }
  sales(filter: { from?: string; to?: string; status?: string; salespersonId?: string; isLoan?: boolean; page: number; pageSize: number }): Observable<Paged<SaleSummary>> {
    return this.http.get<Paged<SaleSummary>>(this.url('/api/sales'), { params: params(filter) });
  }
  sale(id: string): Observable<Sale> { return this.http.get<Sale>(this.url(`/api/sales/${id}`)); }
  receiptPdf(id: string): Observable<Blob> {
    return this.http.get(this.url(`/api/sales/${id}/receipt`), { responseType: 'blob' });
  }

  // ---- loans
  loans(status: string, search: string, page: number, pageSize: number): Observable<Paged<LoanRow>> {
    return this.http.get<Paged<LoanRow>>(this.url('/api/loans'), { params: params({ status, search, page, pageSize }) });
  }
  loan(id: string): Observable<Sale> { return this.http.get<Sale>(this.url(`/api/loans/${id}`)); }
  payLoan(id: string, payment: PaymentRequest): Observable<Sale> {
    return this.http.post<Sale>(this.url(`/api/loans/${id}/payments`), payment);
  }

  // ---- uploads
  uploadProof(file: File): Observable<{ path: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ path: string }>(this.url('/api/uploads/payment-proof'), form);
  }
  proofImage(path: string): Observable<Blob> {
    // path looks like "payment-proofs/<name>.jpg"
    return this.http.get(this.url(`/api/uploads/${path}`), { responseType: 'blob' });
  }

  // ---- daily session
  sessionToday(): Observable<SessionSummary> { return this.http.get<SessionSummary>(this.url('/api/sessions/today')); }
  checkout(): Observable<SessionSummary> { return this.http.post<SessionSummary>(this.url('/api/sessions/checkout'), {}); }
  reopenSession(id: string): Observable<unknown> { return this.http.post(this.url(`/api/sessions/${id}/reopen`), {}); }

  // ---- dashboards
  salespersonDashboard(): Observable<SalespersonDashboard> {
    return this.http.get<SalespersonDashboard>(this.url('/api/dashboard/salesperson'));
  }
  adminDashboard(period: Period): Observable<AdminDashboard> {
    return this.http.get<AdminDashboard>(this.url('/api/dashboard/admin'), { params: params({ period }) });
  }

  // ---- reports (json for the screen, pdf for download)
  report(kind: 'sales' | 'stock' | 'loans' | 'performance', q: { from?: string; to?: string; status?: string }): Observable<ReportDoc> {
    return this.http.get<ReportDoc>(this.url(`/api/reports/${kind}`), { params: params({ ...q, format: 'json' }) });
  }
  reportPdf(kind: 'sales' | 'stock' | 'loans' | 'performance', q: { from?: string; to?: string; status?: string }): Observable<Blob> {
    return this.http.get(this.url(`/api/reports/${kind}`), { params: params({ ...q, format: 'pdf' }), responseType: 'blob' });
  }

  // ---- settings
  company(): Observable<CompanySettings> { return this.http.get<CompanySettings>(this.url('/api/settings/company')); }
  saveCompany(c: { companyName: string; address: string; phone: string; tin: string }): Observable<CompanyInfo> {
    return this.http.put<CompanyInfo>(this.url('/api/settings/company'), c);
  }
}
