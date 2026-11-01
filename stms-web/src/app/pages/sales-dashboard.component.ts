import { Component, OnInit, inject, signal } from '@angular/core';

import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { PdfService } from '../core/pdf.service';
import { NotificationService } from '../core/notification.service';
import { SalespersonDashboard, SessionSummary } from '../core/models';
import { errMsg } from '../core/util';
import { ModalComponent } from '../shared/modal.component';
import { TPipe } from '../core/t.pipe';
import { FdatePipe } from '../core/fdate.pipe';

// Salesperson dashboard. Counts only: there is no revenue anywhere on this page.
@Component({
  selector: 'app-sales-dashboard',
  standalone: true,
  imports: [TPipe, FdatePipe, RouterLink, ModalComponent],
  template: `
    <div class="page-head">
      <div>
        <h2>{{ 'Today' | t }}</h2>
        @if (data(); as d) {
          @switch (d.session.state) {
            @case ('NotStarted') { <span class="badge">{{ 'Not started. Your day starts with your first sale.' | t }}</span> }
            @case ('Open') { <span class="badge ok">{{ 'Selling since' | t }} {{ d.session.startedAt | fdate:'time' }}</span> }
            @default { <span class="badge muted">{{ 'Checked out at' | t }} {{ d.session.checkedOutAt | fdate:'time' }}</span> }
          }
        }
      </div>
      <div class="actions">
        <a class="btn primary" routerLink="/sell">{{ 'New sale' | t }}</a>
        @if (data()?.session?.state === 'Open') {
          <button type="button" class="btn danger" (click)="confirmCheckout.set(true)">{{ 'Check out' | t }}</button>
        }
      </div>
    </div>

    @if (error()) { <div class="alert error">{{ error() | t }}</div> }
    @if (loading()) { <p class="muted">{{ 'Loading...' | t }}</p> }

    @if (data(); as d) {
      <div class="grid kpis">
        <div class="card kpi"><span class="kpi-label">{{ 'Items sold' | t }}</span><span class="kpi-value">{{ d.session.itemsSold }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'Sales made' | t }}</span><span class="kpi-value">{{ d.session.transactions }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'Loan sales' | t }}</span><span class="kpi-value">{{ d.session.loanSales }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'Loan payments received' | t }}</span><span class="kpi-value">{{ d.session.loanPaymentsReceived }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'Open loans' | t }}</span><span class="kpi-value">{{ d.loans.openCount }}</span><span class="kpi-sub">{{ '{n} customers owe' | t:{ n: d.loans.customersOwing } }}</span></div>
        <div class="card kpi">
          <span class="kpi-label">{{ 'Stock' | t }}</span>
          <span class="kpi-value"><span class="dot big" [class.yellow]="d.stock.level === 'Yellow'" [class.red]="d.stock.level === 'Red'"></span></span>
          <span class="kpi-sub">
            @if (d.stock.level === 'Green') { {{ 'All levels fine' | t }} }
            @else { {{ '{a} low, {b} out of stock' | t:{ a: d.stock.lowStock, b: d.stock.outOfStock } }} }
          </span>
        </div>
      </div>

      <div class="grid two">
        <div class="card">
          <h3>{{ 'Payments received today' | t }}</h3>
          @if (d.session.paymentsByMethod.length === 0) { <p class="muted">{{ 'None yet.' | t }}</p> }
          <table>
            <tbody>
              @for (m of d.session.paymentsByMethod; track m.method) {
                <tr><td>{{ m.method | t }}</td><td class="num">{{ m.count }}</td></tr>
              }
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>{{ 'My latest sales' | t }}</h3>
          @if (d.recentSales.length === 0) { <p class="muted">{{ 'No sales yet today.' | t }}</p> }
          <table>
            <tbody>
              @for (s of d.recentSales; track s.id) {
                <tr>
                  <td>{{ s.invoiceNo }}<br><small class="muted">{{ s.createdAt | fdate:'time' }}, {{ '{n} items' | t:{ n: s.itemCount } }}</small></td>
                  <td>@if (s.isLoan) { <span class="badge warn">{{ 'Loan' | t }}</span> }</td>
                  <td class="num"><button type="button" class="btn small" (click)="print(s.id)">{{ 'Print receipt' | t }}</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (confirmCheckout()) {
      <app-modal [title]="'Check out' | t" [width]="440" (closed)="confirmCheckout.set(false)">
        <p>{{ 'This ends your sales for today. You will not be able to sell again until the admin reopens your day.' | t }}</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" (click)="confirmCheckout.set(false)">{{ 'Cancel' | t }}</button>
          <button type="button" class="btn danger" [disabled]="busy()" (click)="doCheckout()">{{ busy() ? 'Checking out...' : 'Yes, check out' }}</button>
        </div>
      </app-modal>
    }

    @if (summary(); as s) {
      <app-modal [title]="'Day finished' | t" [width]="440" (closed)="summary.set(null)">
        <p>{{ 'You are checked out. Today you made:' | t }}</p>
        <ul class="plain">
          <li><strong>{{ s.transactions }}</strong> {{ 'sales' | t }} ({{ '{n} items' | t:{ n: s.itemsSold } }})</li>
          <li><strong>{{ s.loanSales }}</strong> {{ 'loan sales' | t }}</li>
          <li><strong>{{ s.loanPaymentsReceived }}</strong> {{ 'loan payments received' | t }}</li>
        </ul>
        <div class="modal-actions"><button type="button" class="btn primary" (click)="summary.set(null)">{{ 'Done' | t }}</button></div>
      </app-modal>
    }
  `
})
export class SalesDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private pdf = inject(PdfService);
  private notes = inject(NotificationService);

  readonly data = signal<SalespersonDashboard | null>(null);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly confirmCheckout = signal(false);
  readonly summary = signal<SessionSummary | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.salespersonDashboard().subscribe({
      next: d => { this.data.set(d); this.loading.set(false); this.notes.refresh(); },
      error: e => { this.error.set(errMsg(e)); this.loading.set(false); }
    });
  }

  doCheckout(): void {
    this.busy.set(true);
    this.api.checkout().subscribe({
      next: s => {
        this.summary.set(s);
        this.confirmCheckout.set(false);
        this.busy.set(false);
        this.load();
      },
      error: e => { this.error.set(errMsg(e)); this.confirmCheckout.set(false); this.busy.set(false); }
    });
  }

  print(id: string): void {
    this.pdf.print(this.api.receiptPdf(id), e => this.error.set(errMsg(e)));
  }
}
