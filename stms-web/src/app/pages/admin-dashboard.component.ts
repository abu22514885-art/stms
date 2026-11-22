import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AdminDashboard, Period } from '../core/models';
import { errMsg } from '../core/util';
import { ChartComponent, ChartSet } from '../shared/chart.component';
import { tr } from '../core/i18n';
import { TPipe } from '../core/t.pipe';
import { FdatePipe } from '../core/fdate.pipe';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [TPipe, FdatePipe, DecimalPipe, RouterLink, ChartComponent],
  template: `
    <div class="page-head">
      <div>
        <h2>{{ 'Dashboard' | t }}</h2>
        @if (data(); as d) { <span class="muted">{{ d.selected.from | fdate:'date' }} {{ 'to' | t }} {{ d.selected.to | fdate:'date' }}</span> }
      </div>
      <div class="tabs">
        @for (p of periods; track p.key) {
          <button type="button" class="tab" [class.on]="period() === p.key" (click)="select(p.key)">{{ p.label | t }}</button>
        }
      </div>
    </div>

    @if (error()) { <div class="alert error">{{ error() | t }}</div> }
    @if (loading() && !data()) { <p class="muted">{{ 'Loading...' | t }}</p> }

    @if (data(); as d) {
      @if (d.pendingApprovals > 0) {
        <div class="alert warn">
          {{ 'salesperson accounts waiting for approval: {n}' | t:{ n: d.pendingApprovals } }}
          <a routerLink="/users">{{ 'Review' | t }}</a>
        </div>
      }

      <div class="grid kpis">
        <div class="card kpi"><span class="kpi-label">{{ 'Total sales' | t }}</span><span class="kpi-value">{{ d.selected.stats.sales | number:'1.2-2' }}</span><span class="kpi-sub">{{ '{n} sales' | t:{ n: d.selected.stats.transactions } }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'Money collected' | t }}</span><span class="kpi-value">{{ d.selected.stats.collected | number:'1.2-2' }}</span><span class="kpi-sub">{{ 'cash and transfers' | t }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'Gross profit' | t }}</span><span class="kpi-value">{{ d.selected.stats.profit | number:'1.2-2' }}</span><span class="kpi-sub">{{ 'before VAT' | t }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'VAT charged' | t }}</span><span class="kpi-value">{{ d.selected.stats.vat | number:'1.2-2' }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'Items sold' | t }}</span><span class="kpi-value">{{ d.selected.stats.itemsSold }}</span></div>
        <div class="card kpi"><span class="kpi-label">{{ 'Loans still owed' | t }}</span><span class="kpi-value">{{ d.loans.outstanding | number:'1.2-2' }}</span><span class="kpi-sub">{{ '{n} customers' | t:{ n: d.loans.customersOwing } }}</span></div>
      </div>

      <div class="card">
        <h3>{{ 'Credit status' | t }}</h3>
        <div class="grid four">
          <div class="card mini"><span class="kpi-label">{{ 'Due in 3 days' | t }}</span><strong>{{ d.credit.dueSoon }}</strong></div>
          <div class="card mini"><span class="kpi-label">{{ 'Grace period' | t }}</span><strong>{{ d.credit.inGrace }}</strong></div>
          <div class="card mini"><span class="kpi-label">{{ 'Overdue' | t }}</span><strong>{{ d.credit.overdue }}</strong></div>
          <div class="card mini"><span class="kpi-label">{{ 'Credit blocked' | t }}</span><strong>{{ d.credit.restricted }}</strong></div>
        </div>
        <p class="muted">
          {{ 'Owed: {a} (penalties {p}). Overdue: {o}.' | t:{ a: (d.credit.totalDue ?? 0 | number:'1.2-2'), p: (d.credit.penaltyDue ?? 0 | number:'1.2-2'), o: (d.credit.overdueAmount ?? 0 | number:'1.2-2') } }}
          {{ 'Collected this month: {c}, of which penalties {p}.' | t:{ c: (d.credit.collectedThisMonth ?? 0 | number:'1.2-2'), p: (d.credit.penaltyCollectedThisMonth ?? 0 | number:'1.2-2') } }}
        </p>
        @if ((d.credit.worst ?? []).length > 0) {
          <div class="table-wrap">
            <table>
              <thead><tr><th>{{ 'Customer' | t }}</th><th>{{ 'Invoice' | t }}</th><th class="num">{{ 'Days late' | t }}</th><th>{{ 'Status' | t }}</th><th class="num">{{ 'Total due' | t }}</th></tr></thead>
              <tbody>
                @for (w of d.credit.worst ?? []; track w.saleId) {
                  <tr>
                    <td>{{ w.customer }}<br><small class="muted">{{ w.phone }}</small></td><td class="nowrap">{{ w.invoiceNo }}</td>
                    <td class="num">{{ w.overdueDays }}</td>
                    <td><span class="badge" [class.bad]="w.status === 'Overdue' || w.status === 'Restricted'" [class.warn]="w.status === 'Grace period'">{{ (w.status === 'Restricted' ? 'Credit blocked' : w.status) | t }}</span></td>
                    <td class="num"><strong>{{ w.totalDue | number:'1.2-2' }}</strong></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        <a routerLink="/loans">{{ 'Open loans' | t }}</a>
      </div>

      <div class="grid four">
        <div class="card mini"><span class="kpi-label">{{ 'Today' | t }}</span><strong>{{ d.periods.day.sales | number:'1.2-2' }}</strong></div>
        <div class="card mini"><span class="kpi-label">{{ 'This week' | t }}</span><strong>{{ d.periods.week.sales | number:'1.2-2' }}</strong></div>
        <div class="card mini"><span class="kpi-label">{{ 'This month' | t }}</span><strong>{{ d.periods.month.sales | number:'1.2-2' }}</strong></div>
        <div class="card mini"><span class="kpi-label">{{ 'This year' | t }}</span><strong>{{ d.periods.year.sales | number:'1.2-2' }}</strong></div>
      </div>

      <div class="card">
        <h3>{{ 'Sales over time' | t }}</h3>
        <app-chart type="line" [labels]="seriesLabels()" [sets]="seriesSets()"></app-chart>
      </div>

      <div class="grid two">
        <div class="card">
          <h3>{{ 'Best selling products' | t }}</h3>
          @if (d.selected.topProducts.length === 0) { <p class="muted">{{ 'No sales in this period.' | t }}</p> }
          @else { <app-chart type="bar" [labels]="topLabels()" [sets]="topSets()"></app-chart> }
        </div>
        <div class="card">
          <h3>{{ 'Money received by payment method' | t }}</h3>
          @if (d.selected.byPaymentMethod.length === 0) { <p class="muted">{{ 'No payments in this period.' | t }}</p> }
          @else { <app-chart type="doughnut" [labels]="methodLabels()" [sets]="methodSets()"></app-chart> }
        </div>
      </div>

      <div class="grid two">
        <div class="card">
          <h3>{{ 'Salespeople' | t }}</h3>
          @if (d.selected.bySalesperson.length === 0) { <p class="muted">{{ 'No sales in this period.' | t }}</p> }
          @else {
            <div class="table-wrap">
              <table>
                <thead><tr><th>{{ 'Name' | t }}</th><th class="num">{{ 'Sales' | t }}</th><th class="num">{{ 'Items' | t }}</th><th class="num">{{ 'Total' | t }}</th><th class="num">{{ 'Profit' | t }}</th></tr></thead>
                <tbody>
                  @for (p of d.selected.bySalesperson; track p.id) {
                    <tr><td>{{ p.name }}</td><td class="num">{{ p.transactions }}</td><td class="num">{{ p.itemsSold }}</td><td class="num">{{ p.sales | number:'1.2-2' }}</td><td class="num">{{ p.profit | number:'1.2-2' }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <div class="card">
          <h3>
            {{ 'Stock' | t }}
            <span class="dot" [class.yellow]="d.stock.level === 'Yellow'" [class.red]="d.stock.level === 'Red'"></span>
          </h3>
          <p class="muted">
            {{ '{p} products, {u} units, worth {v} at cost.' | t:{ p: d.stock.totalProducts, u: d.stock.totalUnits, v: ((d.stock.stockValueAtCost | number:'1.2-2') ?? '0.00') } }}
          </p>
          @if (d.stock.lowItems.length === 0) { <p>{{ 'All stock levels are fine.' | t }}</p> }
          <table>
            <tbody>
              @for (i of d.stock.lowItems; track i.id) {
                <tr>
                  <td><span class="dot" [class.yellow]="i.status === 'Yellow'" [class.red]="i.status === 'Red'"></span> {{ i.name }}</td>
                  <td class="num">{{ '{a} of {b}' | t:{ a: i.quantity, b: i.stockedQuantity } }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3>{{ 'Today\'s sales sessions' | t }}</h3>
        @if (d.todaySessions.length === 0) { <p class="muted">{{ 'Nobody has started selling today.' | t }}</p> }
        <div class="table-wrap">
          <table>
            <tbody>
              @for (s of d.todaySessions; track s.id) {
                <tr>
                  <td>{{ s.salesperson }}</td>
                  <td>{{ 'Started' | t }} {{ s.startedAt | fdate:'time' }}</td>
                  <td>
                    @if (s.checkedOutAt) { <span class="badge muted">{{ 'Checked out' | t }} {{ s.checkedOutAt | fdate:'time' }}</span> }
                    @else { <span class="badge ok">{{ 'Selling' | t }}</span> }
                  </td>
                  <td class="num">
                    @if (s.checkedOutAt) { <button type="button" class="btn small" (click)="reopen(s.id)">{{ 'Reopen' | t }}</button> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);

  readonly periods: { key: Period; label: string }[] = [
    { key: 'day', label: 'Today' }, { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' }, { key: 'year', label: 'This year' }
  ];

  readonly period = signal<Period>('day');
  readonly data = signal<AdminDashboard | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);

  readonly seriesLabels = computed(() => this.data()?.selected.series.map(s => s.label) ?? []);
  readonly seriesSets = computed<ChartSet[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: tr('Sales'), data: d.selected.series.map(s => s.sales) },
      { label: tr('Collected'), data: d.selected.series.map(s => s.collected) }
    ];
  });
  readonly topLabels = computed(() => this.data()?.selected.topProducts.map(p => p.name) ?? []);
  readonly topSets = computed<ChartSet[]>(() => [
    { label: tr('Sales'), data: this.data()?.selected.topProducts.map(p => p.sales) ?? [] }
  ]);
  readonly methodLabels = computed(() => this.data()?.selected.byPaymentMethod.map(m => m.method) ?? []);
  readonly methodSets = computed<ChartSet[]>(() => [
    { label: tr('Received'), data: this.data()?.selected.byPaymentMethod.map(m => m.amount) ?? [] }
  ]);

  ngOnInit(): void { this.load(); }

  select(p: Period): void {
    this.period.set(p);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.adminDashboard(this.period()).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: e => { this.error.set(errMsg(e)); this.loading.set(false); }
    });
  }

  reopen(id: string): void {
    this.api.reopenSession(id).subscribe({
      next: () => this.load(),
      error: e => this.error.set(errMsg(e))
    });
  }
}