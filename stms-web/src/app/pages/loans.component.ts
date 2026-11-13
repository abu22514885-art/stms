import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { PdfService } from '../core/pdf.service';
import { LoanRow, PaymentDraft, PaymentMethod, Sale } from '../core/models';
import { errMsg, r2 } from '../core/util';
import { PagerComponent } from '../shared/pager.component';
import { ModalComponent } from '../shared/modal.component';
import { PaymentFormComponent } from '../shared/payment-form.component';
import { PaymentSuccessComponent } from '../shared/Payment success.component';
import { TPipe } from '../core/t.pipe';
import { FdatePipe } from '../core/fdate.pipe';

// Customers who bought on loan. A repayment follows the same payment steps as a sale.
@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [TPipe, FdatePipe, DecimalPipe, FormsModule, ModalComponent, PaymentFormComponent, PaymentSuccessComponent, PagerComponent],
  template: `
    <div class="page-head"><h2>{{ 'Loans' | t }}</h2></div>

    <div class="toolbar">
      <input type="search" [placeholder]="'Search name, phone or invoice' | t" [ngModel]="search" (ngModelChange)="search = $event" (keyup.enter)="find()">
      <select [ngModel]="status" (ngModelChange)="status = $event; find()">
        <option value="open">{{ 'Open' | t }}</option>
        <option value="paid">{{ 'Paid' | t }}</option>
        <option value="all">{{ 'All' | t }}</option>
      </select>
      <button type="button" class="btn" (click)="find()">{{ 'Search' | t }}</button>
    </div>

    @if (error()) { <div class="alert error">{{ error() | t }}</div> }
    @if (loading()) { <p class="muted">{{ 'Loading...' | t }}</p> }

    <div class="card table-wrap">
      <table>
        <thead>
          <tr><th>{{ 'Invoice' | t }}</th><th>{{ 'Customer' | t }}</th><th>{{ 'Phone' | t }}</th><th>{{ 'Date' | t }}</th><th class="num">{{ 'Total' | t }}</th><th class="num">{{ 'Paid' | t }}</th><th class="num">{{ 'Balance' | t }}</th><th>{{ 'Status' | t }}</th><th></th></tr>
        </thead>
        <tbody>
          @for (l of rows(); track l.id) {
            <tr>
              <td class="nowrap">{{ l.invoiceNo }}</td>
              <td>{{ l.customerName }}</td>
              <td class="nowrap">{{ l.phone }}</td>
              <td class="nowrap">{{ l.createdAt | fdate:'date' }}</td>
              <td class="num">{{ l.total | number:'1.2-2' }}</td>
              <td class="num">{{ l.amountPaid | number:'1.2-2' }}</td>
              <td class="num"><strong>{{ l.balance | number:'1.2-2' }}</strong></td>
              <td><span class="badge" [class.warn]="l.balance > 0" [class.ok]="l.balance <= 0">{{ l.status | t }}</span></td>
              <td class="num nowrap">
                <button type="button" class="btn small" (click)="open(l.id)">{{ 'Details' | t }}</button>
              </td>
            </tr>
          }
          @if (!loading() && rows().length === 0) {
            <tr><td colspan="9" class="center muted">{{ 'No loans found.' | t }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    <app-pager [page]="page()" [pageSize]="pageSize" [total]="total()" (pageChange)="goTo($event)"></app-pager>

    @if (current(); as s) {
      <app-modal [title]="('Loan' | t) + ' ' + s.invoiceNo" [width]="640" (closed)="close()">
        @if (modalError()) { <div class="alert error">{{ modalError() | t }}</div> }
        <p>
          <strong>{{ s.customer?.fullName }}</strong>, {{ s.customer?.phone }}<br>
          <small class="muted">{{ s.createdAt | fdate:'datetime' }}, {{ s.salesperson }}</small>
        </p>

        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ 'Item' | t }}</th><th class="num">{{ 'Qty' | t }}</th><th class="num">{{ 'Price' | t }}</th><th class="num">{{ 'Total' | t }}</th></tr></thead>
            <tbody>
              @for (i of s.items; track i.sku) {
                <tr><td>{{ i.name }}</td><td class="num">{{ i.quantity }}</td><td class="num">{{ i.unitPrice | number:'1.2-2' }}</td><td class="num">{{ i.lineTotal | number:'1.2-2' }}</td></tr>
              }
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div><span>{{ 'Total to be paid' | t }}</span><span>{{ s.total | number:'1.2-2' }}</span></div>
          <div><span>{{ 'Paid so far' | t }}</span><span>{{ s.amountPaid | number:'1.2-2' }}</span></div>
          <div class="grand"><span>{{ 'Balance' | t }}</span><span>{{ s.balance | number:'1.2-2' }}</span></div>
        </div>

        @if (s.payments.length > 0) {
          <h4>{{ 'Payments' | t }}</h4>
          <div class="table-wrap">
            <table>
              <tbody>
                @for (p of s.payments; track p.id) {
                  <tr>
                    <td>{{ p.paidAt | fdate:'datetime' }}</td>
                    <td>{{ p.method | t }}@if (p.provider) { , {{ p.provider }} }<br><small class="muted">{{ p.transactionRef }}</small></td>
                    <td class="num">{{ p.amount | number:'1.2-2' }}</td>
                    <td class="num">
                      @if (isAdmin() && p.receiptImagePath) {
                        <button type="button" class="btn small ghost" (click)="showProof(p.receiptImagePath)">{{ 'Screenshot' | t }}</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (s.balance > 0) {
          <h4>{{ 'Record a payment' | t }}</h4>
          <app-payment-form [methods]="methods()" [amount]="s.balance" [editable]="true" (draftChange)="draft = $event"></app-payment-form>
          @if (draft && !draft.valid) { <small class="muted">{{ draft.problem | t }}</small> }
          <div class="modal-actions">
            <button type="button" class="btn ghost" (click)="receipt(s.id)">{{ 'Print receipt' | t }}</button>
            <button type="button" class="btn primary" [disabled]="!draft?.valid || saving()" (click)="pay(s)">
              {{ saving() ? 'Saving...' : 'Save payment' }}
            </button>
          </div>
        } @else {
          <div class="modal-actions">
            <button type="button" class="btn ghost" (click)="receipt(s.id)">{{ 'Print receipt' | t }}</button>
            <button type="button" class="btn" (click)="close()">{{ 'Close' | t }}</button>
          </div>
        }
      </app-modal>
    }

    @if (paid(); as p) {
      <app-payment-success [sale]="p.sale" [paidAmount]="p.amount" [attachmentUrl]="p.attach" (closed)="paid.set(null)"></app-payment-success>
    }
  `
})
export class LoansComponent implements OnInit {
  private api = inject(ApiService);
  private pdf = inject(PdfService);
  private auth = inject(AuthService);

  @ViewChild(PaymentFormComponent) payForm?: PaymentFormComponent;

  readonly rows = signal<LoanRow[]>([]);
  readonly methods = signal<PaymentMethod[]>([]);
  readonly current = signal<Sale | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly modalError = signal('');
  readonly paid = signal<{ sale: Sale; amount: number; attach: string | null } | null>(null);   // shows the payment-complete check + receipt

  status = 'open';
  search = '';
  draft: PaymentDraft | null = null;

  isAdmin(): boolean { return this.auth.user()?.role === 'Admin'; }

  ngOnInit(): void {
    this.api.paymentMethods().subscribe({ next: m => this.methods.set(m.filter(x => x.isActive)), error: e => this.error.set(errMsg(e)) });
    this.load();
  }

  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 20;

  goTo(p: number): void { this.page.set(p); this.load(); }
  find(): void { this.page.set(1); this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.loans(this.status, this.search.trim(), this.page(), this.pageSize).subscribe({
      next: r => {
        if (r.items.length === 0 && r.total > 0 && this.page() > 1) { this.page.set(this.page() - 1); this.load(); return; }
        this.rows.set(r.items); this.total.set(r.total); this.loading.set(false);
      },
      error: e => { this.error.set(errMsg(e)); this.loading.set(false); }
    });
  }

  open(id: string): void {
    this.modalError.set('');
    this.draft = null;
    this.api.loan(id).subscribe({ next: s => this.current.set(s), error: e => this.error.set(errMsg(e)) });
  }

  close(): void { this.current.set(null); this.draft = null; }

  pay(s: Sale): void {
    if (!this.draft?.valid || !this.draft.request) return;
    if (this.draft.request.amount > r2(s.balance)) {
      this.modalError.set('The amount is more than the balance.');
      return;
    }
    this.saving.set(true);
    this.modalError.set('');
    this.api.payLoan(s.id, this.draft.request).subscribe({
      next: updated => {
        this.saving.set(false);
        this.paid.set({ sale: updated, amount: this.draft?.request?.amount ?? 0, attach: this.payForm?.previewUrl() || null });
        this.current.set(updated);
        this.draft = null;
        this.payForm?.reset();
        this.load();
      },
      error: e => { this.saving.set(false); this.modalError.set(errMsg(e)); }
    });
  }

  receipt(id: string): void { this.pdf.print(this.api.receiptPdf(id), e => this.modalError.set(errMsg(e))); }
  showProof(path: string): void { this.pdf.showImage(this.api.proofImage(path), e => this.modalError.set(errMsg(e))); }
}