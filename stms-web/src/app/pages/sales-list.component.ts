import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { PdfService } from '../core/pdf.service';
import { Sale, SaleSummary } from '../core/models';
import { errMsg, firstOfMonth, isoDate } from '../core/util';
import { PagerComponent } from '../shared/pager.component';
import { ModalComponent } from '../shared/modal.component';
import { TPipe } from '../core/t.pipe';
import { FdatePipe } from '../core/fdate.pipe';

// Admin: all sales with filters and money. Salesperson: own sales for today, no money columns.
@Component({
  selector: 'app-sales-list',
  standalone: true,
  imports: [TPipe, FdatePipe, DecimalPipe, FormsModule, ModalComponent, PagerComponent],
  template: `
    <div class="page-head"><h2>{{ isAdmin() ? 'Sales' : "Today's sales" }}</h2></div>

    @if (isAdmin()) {
      <div class="toolbar">
        <label>{{ 'From' | t }} <input type="date" [ngModel]="from" (ngModelChange)="from = $event"></label>
        <label>{{ 'To' | t }} <input type="date" [ngModel]="to" (ngModelChange)="to = $event"></label>
        <select [ngModel]="status" (ngModelChange)="status = $event">
          <option value="">{{ 'All statuses' | t }}</option>
          <option value="Paid">{{ 'Paid' | t }}</option>
          <option value="PartiallyPaid">{{ 'Partially paid' | t }}</option>
          <option value="Loan">{{ 'Loan' | t }}</option>
        </select>
        <button type="button" class="btn primary" (click)="show()">{{ 'Show' | t }}</button>
      </div>
    }

    @if (error()) { <div class="alert error">{{ error() | t }}</div> }
    @if (loading()) { <p class="muted">{{ 'Loading...' | t }}</p> }

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ 'Invoice' | t }}</th><th>{{ 'Date' | t }}</th><th>{{ 'Salesperson' | t }}</th><th>{{ 'Customer' | t }}</th><th class="num">{{ 'Items' | t }}</th>
            @if (isAdmin()) { <th class="num">{{ 'Total' | t }}</th><th class="num">{{ 'Paid' | t }}</th> }
            <th>{{ 'Status' | t }}</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (s of rows(); track s.id) {
            <tr>
              <td class="nowrap">{{ s.invoiceNo }}</td>
              <td class="nowrap">{{ s.createdAt | fdate:'datetime' }}</td>
              <td>{{ s.salesperson }}</td>
              <td>{{ s.customer }}</td>
              <td class="num">{{ s.itemCount }}</td>
              @if (isAdmin()) {
                <td class="num">{{ s.total | number:'1.2-2' }}</td>
                <td class="num">{{ s.amountPaid | number:'1.2-2' }}</td>
              }
              <td>
                <span class="badge" [class.ok]="s.status === 'Paid'" [class.warn]="s.status !== 'Paid'">{{ s.status | t }}</span>
                @if (s.wantsReceipt) { <span class="badge muted">{{ 'VAT' | t }}</span> }
              </td>
              <td class="num nowrap"><button type="button" class="btn small" (click)="open(s.id)">{{ 'Open' | t }}</button></td>
            </tr>
          }
          @if (!loading() && rows().length === 0) {
            <tr><td [attr.colspan]="isAdmin() ? 9 : 7" class="center muted">{{ 'No sales found.' | t }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    <app-pager [page]="page()" [pageSize]="pageSize" [total]="total()" (pageChange)="goTo($event)"></app-pager>

    @if (current(); as s) {
      <app-modal [title]="('Sale' | t) + ' ' + s.invoiceNo" [width]="640" (closed)="current.set(null)">
        @if (modalError()) { <div class="alert error">{{ modalError() | t }}</div> }
        <p>
          <small class="muted">{{ s.createdAt | fdate:'datetime' }}, {{ s.salesperson }}</small>
          @if (s.customer) { <br>{{ 'Customer:' | t }} <strong>{{ s.customer.fullName }}</strong>, {{ s.customer.phone }} }
        </p>

        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ 'Item' | t }}</th><th class="num">{{ 'Qty' | t }}</th><th class="num">{{ 'Price' | t }}</th><th class="num">{{ 'VAT' | t }}</th><th class="num">{{ 'Total' | t }}</th></tr></thead>
            <tbody>
              @for (i of s.items; track i.sku) {
                <tr>
                  <td>{{ i.name }}</td><td class="num">{{ i.quantity }}</td>
                  <td class="num">{{ i.unitPrice | number:'1.2-2' }}</td>
                  <td class="num">{{ i.vatAmount | number:'1.2-2' }}</td>
                  <td class="num">{{ i.lineTotal | number:'1.2-2' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div><span>{{ 'Subtotal' | t }}</span><span>{{ s.subtotal | number:'1.2-2' }}</span></div>
          <div><span>{{ 'VAT' | t }}</span><span>{{ s.vatTotal | number:'1.2-2' }}</span></div>
          <div class="grand"><span>{{ 'Total' | t }}</span><span>{{ s.total | number:'1.2-2' }}</span></div>
          <div><span>{{ 'Paid' | t }}</span><span>{{ s.amountPaid | number:'1.2-2' }}</span></div>
          @if (s.balance > 0) { <div><span>{{ 'Balance' | t }}</span><span>{{ s.balance | number:'1.2-2' }}</span></div> }
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

        <div class="modal-actions">
          <button type="button" class="btn ghost" (click)="download(s)">{{ 'Download PDF' | t }}</button>
          <button type="button" class="btn primary" (click)="print(s.id)">{{ 'Print receipt' | t }}</button>
        </div>
      </app-modal>
    }
  `
})
export class SalesListComponent implements OnInit {
  private api = inject(ApiService);
  private pdf = inject(PdfService);
  private auth = inject(AuthService);

  readonly rows = signal<SaleSummary[]>([]);
  readonly current = signal<Sale | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly modalError = signal('');

  from = firstOfMonth();
  to = isoDate(new Date());
  status = '';

  isAdmin(): boolean { return this.auth.user()?.role === 'Admin'; }

  ngOnInit(): void { this.load(); }

  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 20;

  goTo(p: number): void { this.page.set(p); this.load(); }
  show(): void { this.page.set(1); this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const paging = { page: this.page(), pageSize: this.pageSize };
    const filter = this.isAdmin() ? { from: this.from, to: this.to, status: this.status, ...paging } : paging;
    this.api.sales(filter).subscribe({
      next: r => { this.rows.set(r.items); this.total.set(r.total); this.loading.set(false); },
      error: e => { this.error.set(errMsg(e)); this.loading.set(false); }
    });
  }

  open(id: string): void {
    this.modalError.set('');
    this.api.sale(id).subscribe({ next: s => this.current.set(s), error: e => this.error.set(errMsg(e)) });
  }

  print(id: string): void { this.pdf.print(this.api.receiptPdf(id), e => this.modalError.set(errMsg(e))); }
  download(s: Sale): void { this.pdf.download(this.api.receiptPdf(s.id), `${s.invoiceNo}.pdf`, e => this.modalError.set(errMsg(e))); }
  showProof(path: string): void { this.pdf.showImage(this.api.proofImage(path), e => this.modalError.set(errMsg(e))); }
}
