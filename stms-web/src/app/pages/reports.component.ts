import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { PdfService } from '../core/pdf.service';
import { ReportDoc } from '../core/models';
import { errMsg, firstOfMonth, isoDate } from '../core/util';
import { TPipe } from '../core/t.pipe';

type Kind = 'sales' | 'stock' | 'loans' | 'performance';

// Admin reports: see them as tables here, or download/print the PDF.
@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [TPipe, FormsModule],
  template: `
    <div class="page-head"><h2>{{ 'Reports' | t }}</h2></div>

    <div class="tabs">
      @for (t of tabs; track t.kind) {
        <button type="button" class="tab" [class.on]="kind() === t.kind" (click)="select(t.kind)">{{ t.label | t }}</button>
      }
    </div>

    <div class="toolbar">
      @if (kind() !== 'stock') {
        <label>{{ 'From' | t }} <input type="date" [ngModel]="from" (ngModelChange)="from = $event"></label>
        <label>{{ 'To' | t }} <input type="date" [ngModel]="to" (ngModelChange)="to = $event"></label>
      }
      <button type="button" class="btn primary" (click)="load()">{{ 'Show' | t }}</button>
      <button type="button" class="btn" (click)="download()">{{ 'Download PDF' | t }}</button>
      <button type="button" class="btn ghost" (click)="print()">{{ 'Print' | t }}</button>
    </div>

    @if (error()) { <div class="alert error">{{ error() | t }}</div> }
    @if (loading()) { <p class="muted">{{ 'Loading...' | t }}</p> }

    @if (doc(); as d) {
      <div class="card">
        <h3>{{ d.title }}</h3>
        <p class="muted">{{ d.subtitle }}</p>

        @for (s of d.sections; track $index) {
          @if (s.heading) { <h4>{{ s.heading }}</h4> }
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  @for (h of s.headers; track $index) { <th [class.num]="s.rightAlign[$index]">{{ h }}</th> }
                </tr>
              </thead>
              <tbody>
                @for (row of shown(s.rows); track $index) {
                  <tr>
                    @for (cell of row; track $index) { <td [class.num]="s.rightAlign[$index]">{{ cell }}</td> }
                  </tr>
                }
                @if (s.rows.length === 0) { <tr><td [attr.colspan]="s.headers.length" class="center muted">{{ 'No data.' | t }}</td></tr> }
              </tbody>
            </table>
          </div>
          @if (s.rows.length > limit) {
            <p class="muted">{{ 'Showing the first {n} of {total} rows. The PDF has all of them.' | t:{ n: limit, total: s.rows.length } }}</p>
          }
          @if (s.totals.length > 0) {
            <div class="totals">
              @for (t of s.totals; track $index) { <div><span>{{ t.label }}</span><span>{{ t.value }}</span></div> }
            </div>
          }
        }

        @for (n of d.notes; track $index) { <p class="muted"><small>{{ n }}</small></p> }
      </div>
    }
  `
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);
  private pdf = inject(PdfService);

  readonly tabs: { kind: Kind; label: string }[] = [
    { kind: 'sales', label: 'Sales' },
    { kind: 'stock', label: 'Stock' },
    { kind: 'loans', label: 'Loans' },
    { kind: 'performance', label: 'Performance' }
  ];
  readonly limit = 500;

  readonly kind = signal<Kind>('sales');
  readonly doc = signal<ReportDoc | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  from = firstOfMonth();
  to = isoDate(new Date());

  ngOnInit(): void { this.load(); }

  shown(rows: string[][]): string[][] { return rows.length > this.limit ? rows.slice(0, this.limit) : rows; }

  select(k: Kind): void {
    this.kind.set(k);
    this.doc.set(null);
    this.load();
  }

  private query(): { from?: string; to?: string } {
    return this.kind() === 'stock' ? {} : { from: this.from, to: this.to };
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.report(this.kind(), this.query()).subscribe({
      next: d => { this.doc.set(d); this.loading.set(false); },
      error: e => { this.error.set(errMsg(e)); this.loading.set(false); }
    });
  }

  download(): void {
    const name = `${this.kind()}-report-${isoDate(new Date())}.pdf`;
    this.pdf.download(this.api.reportPdf(this.kind(), this.query()), name, e => this.error.set(errMsg(e)));
  }

  print(): void { this.pdf.print(this.api.reportPdf(this.kind(), this.query()), e => this.error.set(errMsg(e))); }
}
