import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { PdfService } from '../core/pdf.service';
import { LoanReminder, LoanRow, LoanStatement, PaymentDraft, PaymentMethod, Sale } from '../core/models';
import { errMsg, r2 } from '../core/util';
import { PagerComponent } from '../shared/pager.component';
import { ModalComponent } from '../shared/modal.component';
import { PaymentFormComponent } from '../shared/payment-form.component';
import { PaymentSuccessComponent } from '../shared/payment-success.component';
import { TPipe } from '../core/t.pipe';
import { FdatePipe } from '../core/fdate.pipe';

// Customers who bought on loan. A repayment follows the same payment steps as a sale.
@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [TPipe, FdatePipe, DecimalPipe, FormsModule, ModalComponent, PaymentFormComponent, PaymentSuccessComponent, PagerComponent],
  template: `
    <div class="page-head"><h2>{{ 'Loans' | t }}</h2></div>

    @if (reminders().length > 0) {
      <div class="card">
        <h3>{{ 'Payment reminders' | t }} ({{ reminders().length }})</h3>
        <div class="table-wrap">
          <table>
            <tbody>
              @for (r of reminders(); track r.id) {
                <tr>
                  <td><strong>{{ r.customer }}</strong><br><small class="muted">{{ r.invoiceNo }}</small></td>
                  <td><span class="badge" [class.bad]="r.dueOffset > 0" [class.warn]="r.dueOffset <= 0">{{ r.kind | t }}</span><br>
                      <small class="muted">{{ reminderText(r) | t:{ n: r.dueOffset < 0 ? -r.dueOffset : r.dueOffset } }}</small></td>
                  <td class="num"><strong>{{ r.totalDue | number:'1.2-2' }}</strong></td>
                  <td class="num nowrap">
                    <a class="btn small" [href]="'tel:' + r.phone">{{ 'Call' | t }}</a>
                    <a class="btn small" [href]="'sms:' + r.phone + '?body=' + enc(r.smsText)">{{ 'SMS' | t }}</a>
                    <button type="button" class="btn small ghost" (click)="copy(r)">{{ 'Copy text' | t }}</button>
                    <button type="button" class="btn small primary" (click)="done(r)">{{ 'Done' | t }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <div class="toolbar">
      <input type="search" [placeholder]="'Search name, phone or invoice' | t" [ngModel]="search" (ngModelChange)="search = $event" (keyup.enter)="find()">
      <select [ngModel]="status" (ngModelChange)="status = $event; find()">
        <option value="open">{{ 'Open' | t }}</option>
        <option value="overdue">{{ 'Overdue' | t }}</option>
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
          <tr><th>{{ 'Invoice' | t }}</th><th>{{ 'Customer' | t }}</th><th>{{ 'Phone' | t }}</th><th>{{ 'Date' | t }}</th><th>{{ 'Due date' | t }}</th><th class="num">{{ 'Days late' | t }}</th><th class="num">{{ 'Balance' | t }}</th><th class="num">{{ 'Penalty' | t }}</th><th class="num">{{ 'Total due' | t }}</th><th>{{ 'Status' | t }}</th><th></th></tr>
        </thead>
        <tbody>
          @for (l of rows(); track l.id) {
            <tr>
              <td class="nowrap">{{ l.invoiceNo }}</td>
              <td>{{ l.customerName }}</td>
              <td class="nowrap">{{ l.phone }}</td>
              <td class="nowrap">{{ l.createdAt | fdate:'date' }}</td>
              <td class="nowrap">@if (l.dueDate) { {{ l.dueDate | fdate:'date' }} } @else { - }</td>
              <td class="num">{{ l.status === 'Paid' ? '-' : l.overdueDays }}</td>
              <td class="num">{{ l.balance | number:'1.2-2' }}</td>
              <td class="num">{{ l.penaltyDue | number:'1.2-2' }}</td>
              <td class="num"><strong>{{ l.totalDue | number:'1.2-2' }}</strong></td>
              <td><span class="badge" [class.ok]="l.creditStatus === 'Paid' || l.creditStatus === 'Current'" [class.warn]="l.creditStatus === 'Due soon' || l.creditStatus === 'Grace period'" [class.bad]="l.creditStatus === 'Overdue' || l.creditStatus === 'Restricted'">{{ (l.creditStatus === 'Restricted' ? 'Credit blocked' : l.creditStatus) | t }}</span></td>
              <td class="num nowrap">
                <button type="button" class="btn small" (click)="open(l.id)">{{ 'Details' | t }}</button>
              </td>
            </tr>
          }
          @if (!loading() && rows().length === 0) {
            <tr><td colspan="11" class="center muted">{{ 'No loans found.' | t }}</td></tr>
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

        @if (st(); as c) {
          <div class="totals">
            <div><span>{{ 'Total to be paid' | t }}</span><span>{{ c.total | number:'1.2-2' }}</span></div>
            <div><span>{{ 'Paid so far' | t }}</span><span>{{ c.amountPaid | number:'1.2-2' }}</span></div>
            <div><span>{{ 'Balance' | t }}</span><span>{{ c.balance | number:'1.2-2' }}</span></div>
            <div><span>{{ 'Penalty charged' | t }}</span><span>{{ c.penaltyCharged | number:'1.2-2' }}</span></div>
            <div><span>{{ 'Penalty paid' | t }}</span><span>{{ c.penaltyPaid | number:'1.2-2' }}</span></div>
            <div class="grand"><span>{{ 'Total due' | t }}</span><span>{{ c.totalDue | number:'1.2-2' }}</span></div>
          </div>
          @if (c.dueDate) {
            <p class="muted">
              {{ 'Due date' | t }}: {{ c.dueDate | fdate:'date' }}. {{ 'Grace period ends' | t }}: {{ c.graceEnd | fdate:'date' }}.
              @if (c.overdueDays > 0 && c.totalDue > 0) { <strong>{{ '{n} days overdue' | t:{ n: c.overdueDays } }}</strong> }
              @if (c.nextPenaltyDate && c.totalDue > 0) { {{ 'Next penalty on' | t }} {{ c.nextPenaltyDate | fdate:'date' }}. }
            </p>
            <p class="muted"><small>{{ 'Rule: due after {d} days, {g} days grace, then {r}% a month on the unpaid balance. Credit is blocked at {b} days overdue.' | t:{ d: c.policy.dueDays, g: c.policy.graceDays, r: c.policy.penaltyRatePercent, b: c.policy.blockDays } }}</small></p>
          }
          @if (c.penalties.length > 0) {
            <h4>{{ 'Penalties' | t }}</h4>
            <div class="table-wrap">
              <table>
                <thead><tr><th>{{ 'Date' | t }}</th><th class="num">{{ 'Balance charged on' | t }}</th><th class="num">{{ 'Penalty' | t }}</th></tr></thead>
                <tbody>
                  @for (p of c.penalties; track p.periodNo) {
                    <tr><td>{{ p.periodStart | fdate:'date' }}</td><td class="num">{{ p.balanceBase | number:'1.2-2' }}</td><td class="num">{{ p.amount | number:'1.2-2' }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }
        } @else {
          <div class="totals">
            <div><span>{{ 'Total to be paid' | t }}</span><span>{{ s.total | number:'1.2-2' }}</span></div>
            <div><span>{{ 'Paid so far' | t }}</span><span>{{ s.amountPaid | number:'1.2-2' }}</span></div>
            <div class="grand"><span>{{ 'Balance' | t }}</span><span>{{ s.balance | number:'1.2-2' }}</span></div>
          </div>
        }

        @if (s.payments.length > 0) {
          <h4>{{ 'Payments' | t }}</h4>
          <div class="table-wrap">
            <table>
              <tbody>
                @for (p of s.payments; track p.id) {
                  <tr>
                    <td>{{ p.paidAt | fdate:'datetime' }}</td>
                    <td>{{ p.method | t }}@if (p.provider) { , {{ p.provider }} }<br><small class="muted">{{ p.transactionRef }}</small></td>
                    <td class="num">{{ p.amount | number:'1.2-2' }}@if (penaltyOf(p.id) > 0) { <br><small class="muted">{{ 'penalty {n}' | t:{ n: (penaltyOf(p.id) | number:'1.2-2') } }}</small> }</td>
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

        @if (due(s) > 0) {
          <h4>{{ 'Record a payment' | t }}</h4>
          <p class="muted"><small>{{ 'A payment pays the penalty first, then the balance.' | t }}</small></p>
          <app-payment-form [methods]="methods()" [amount]="due(s)" [editable]="true" (draftChange)="draft = $event"></app-payment-form>
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
  readonly st = signal<LoanStatement | null>(null);
  readonly reminders = signal<LoanReminder[]>([]);
  readonly paid = signal<{ sale: Sale; amount: number; attach: string | null } | null>(null);   // shows the payment-complete check + receipt

  status = 'open';
  search = '';
  draft: PaymentDraft | null = null;

  isAdmin(): boolean { return this.auth.user()?.role === 'Admin'; }

  ngOnInit(): void {
    this.api.paymentMethods().subscribe({ next: m => this.methods.set(m.filter(x => x.isActive)), error: e => this.error.set(errMsg(e)) });
    this.load();
    this.loadReminders();
  }

  // What the customer still owes: the sale balance plus unpaid penalty
  due(s: Sale): number { const c = this.st(); return c && c.saleId === s.id ? c.totalDue : s.balance; }
  penaltyOf(paymentId: string): number { return this.st()?.payments.find(x => x.id === paymentId)?.penaltyPortion ?? 0; }
  enc(v: string): string { return encodeURIComponent(v); }
  reminderText(r: LoanReminder): string {
    return r.dueOffset < 0 ? 'due in {n} day(s)' : r.dueOffset === 0 ? 'due today' : '{n} day(s) past the due date';
  }

  loadReminders(): void {
    this.api.loanReminders().subscribe({ next: r => this.reminders.set(r), error: () => this.reminders.set([]) });
  }
  done(r: LoanReminder): void {
    this.api.reminderDone(r.id).subscribe({ next: () => this.reminders.update(l => l.filter(x => x.id !== r.id)), error: e => this.error.set(errMsg(e)) });
  }
  copy(r: LoanReminder): void {
    navigator.clipboard?.writeText(r.smsText).catch(() => this.error.set('Could not copy the text.'));
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
    this.st.set(null);
    this.api.loan(id).subscribe({ next: s => this.current.set(s), error: e => this.error.set(errMsg(e)) });
    this.api.loanStatement(id).subscribe({ next: c => this.st.set(c), error: () => this.st.set(null) });
  }

  close(): void { this.current.set(null); this.st.set(null); this.draft = null; }

  pay(s: Sale): void {
    if (!this.draft?.valid || !this.draft.request) return;
    if (this.draft.request.amount > r2(this.due(s))) {
      this.modalError.set('The amount is more than the amount due.');
      return;
    }
    this.saving.set(true);
    this.modalError.set('');
    this.api.payLoan(s.id, this.draft.request).subscribe({
      next: updated => {
        this.saving.set(false);
        this.paid.set({ sale: updated, amount: this.draft?.request?.amount ?? 0, attach: this.payForm?.previewUrl() || null });
        this.current.set(updated);
        this.api.loanStatement(updated.id).subscribe({ next: c => this.st.set(c) });
        this.draft = null;
        this.payForm?.reset();
        this.load();
        this.loadReminders();
      },
      error: e => { this.saving.set(false); this.modalError.set(errMsg(e)); }
    });
  }

  receipt(id: string): void { this.pdf.print(this.api.receiptPdf(id), e => this.modalError.set(errMsg(e))); }
  showProof(path: string): void { this.pdf.showImage(this.api.proofImage(path), e => this.modalError.set(errMsg(e))); }
}