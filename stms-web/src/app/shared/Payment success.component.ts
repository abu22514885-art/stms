import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../core/api.service';
import { PdfService } from '../core/pdf.service';
import { Sale } from '../core/models';
import { errMsg } from '../core/util';
import { FdatePipe } from '../core/fdate.pipe';
import { TPipe } from '../core/t.pipe';

// After a payment: a green check mark stays for 2 seconds, then the receipt appears.
// The VAT line is shown only when the sale carries VAT. Without VAT the line is not drawn at all.
@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [TPipe, FdatePipe, DecimalPipe],
  template: `
    <div class="ps-back" role="dialog" aria-modal="true" (click)="phase() === 'receipt' && closed.emit()">
      @if (phase() === 'check') {
        <div class="ps-check" aria-live="polite">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="disc" cx="60" cy="60" r="54"/>
            <circle class="ring" cx="60" cy="60" r="54"/>
            <path class="tick" d="M34 62 L52 80 L88 40"/>
          </svg>
          <h3>{{ (paid > 0 ? 'Payment complete' : 'Sale complete') | t }}</h3>
          @if (paid > 0) { <p class="amt">{{ paid | number:'1.2-2' }}</p> }
        </div>
      } @else {
        <div class="ps-card" (click)="$event.stopPropagation()">
          <div class="ps-head">
            <span class="ps-ok">&#10003;</span>
            <div><strong>{{ 'Receipt' | t }}</strong><small>{{ sale.invoiceNo }} &middot; {{ sale.createdAt | fdate }}</small></div>
            <button type="button" class="ps-x" (click)="closed.emit()" [attr.aria-label]="'Close' | t">&#10005;</button>
          </div>

          <div class="ps-meta">
            <span>{{ 'Salesperson' | t }}: {{ sale.salesperson }}</span>
            @if (sale.customer) { <span>{{ 'Customer' | t }}: {{ sale.customer.fullName }}</span> }
          </div>

          <table class="ps-items">
            <thead><tr><th>{{ 'Items' | t }}</th><th class="r">{{ 'Qty' | t }}</th><th class="r">{{ 'Total' | t }}</th></tr></thead>
            <tbody>
              @for (i of sale.items; track $index) {
                <tr><td>{{ i.name }}</td><td class="r">{{ i.quantity }}</td><td class="r">{{ i.lineTotal | number:'1.2-2' }}</td></tr>
              }
            </tbody>
          </table>

          <div class="ps-tot">
            <div><span>{{ 'Subtotal' | t }}</span><span>{{ sale.subtotal | number:'1.2-2' }}</span></div>
            @if (showVat) { <div><span>{{ 'VAT' | t }}</span><span>{{ sale.vatTotal | number:'1.2-2' }}</span></div> }
            <div class="g"><span>{{ 'Total' | t }}</span><span>{{ sale.total | number:'1.2-2' }}</span></div>
            @if (sale.isLoan) {
              <div><span>{{ 'Paid' | t }}</span><span>{{ sale.amountPaid | number:'1.2-2' }}</span></div>
              <div><span>{{ 'Balance' | t }}</span><span>{{ sale.balance | number:'1.2-2' }}</span></div>
            }
          </div>

          @if (sale.payments.length) {
            <div class="ps-pay">
              @for (p of sale.payments; track p.id) {
                <div>{{ p.method }}@if (p.provider) { &middot; {{ p.provider }} }@if (p.transactionRef) { &middot; {{ p.transactionRef }} }
                  <strong>{{ p.amount | number:'1.2-2' }}</strong></div>
              }
            </div>
          }

          @if (imgUrl()) {
            <div class="ps-att">
              <small>{{ 'Attachment' | t }}</small>
              <a [href]="imgUrl()" target="_blank" rel="noopener"><img [src]="imgUrl()" alt="Payment attachment"></a>
            </div>
          }

          @if (error()) { <p class="ps-err">{{ error() | t }}</p> }
          <div class="ps-act">
            <button type="button" class="btn primary" (click)="print()">{{ 'Print receipt' | t }}</button>
            <button type="button" class="btn" (click)="download()">{{ 'Download PDF' | t }}</button>
            <button type="button" class="btn ghost" (click)="closed.emit()">{{ 'Done' | t }}</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .ps-back { position: fixed; inset: 0; z-index: 100; background: rgba(8,20,16,.72); display: flex; align-items: center; justify-content: center; padding: 16px; overflow: auto; }
    .ps-check { text-align: center; color: #fff; animation: pop .35s ease-out; }
    .ps-check svg { width: 140px; height: 140px; }
    .ps-check circle { fill: none; stroke-width: 6; }
    .disc { fill: #1f9d55 !important; stroke: none !important; transform-origin: 60px 60px; animation: pop .4s ease-out; }
    .ring { stroke: #7be0a4; stroke-dasharray: 340; stroke-dashoffset: 340; animation: draw .6s ease-out forwards; }
    .tick { fill: none; stroke: #fff; stroke-width: 8; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 90; stroke-dashoffset: 90; animation: draw .4s .45s ease-out forwards; }
    .ps-check h3 { margin: 10px 0 2px; font-size: 22px; } .amt { margin: 0; font-size: 30px; font-weight: 700; }
    .ps-card { width: 100%; max-width: 440px; background: var(--surface, #fff); color: var(--text, #1c2430); border-radius: 14px; padding: 16px 18px; box-shadow: 0 16px 48px rgba(0,0,0,.4); animation: pop .3s ease-out; }
    .ps-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .ps-head > div { flex: 1; display: flex; flex-direction: column; line-height: 1.25; } .ps-head small { color: var(--muted, #6b7686); }
    .ps-ok { width: 30px; height: 30px; border-radius: 50%; background: #1f9d55; color: #fff; display: grid; place-items: center; font-weight: 700; }
    .ps-x { background: none; border: 0; font-size: 16px; cursor: pointer; color: inherit; }
    .ps-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--muted, #6b7686); margin-bottom: 8px; }
    .ps-items { width: 100%; border-collapse: collapse; font-size: 14px; }
    .ps-items th, .ps-items td { padding: 5px 4px; border-bottom: 1px solid var(--border, #dfe3e9); text-align: left; } .r { text-align: right !important; }
    .ps-tot { margin-top: 8px; } .ps-tot > div { display: flex; justify-content: space-between; padding: 2px 0; font-size: 14px; }
    .ps-tot .g { font-weight: 700; font-size: 17px; border-top: 1px solid var(--border, #dfe3e9); margin-top: 4px; padding-top: 6px; }
    .ps-pay { margin-top: 8px; font-size: 13px; color: var(--muted, #6b7686); } .ps-pay strong { float: right; color: var(--text, #1c2430); }
    .ps-att { margin-top: 10px; } .ps-att small { display: block; color: var(--muted, #6b7686); margin-bottom: 4px; }
    .ps-att img { max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid var(--border, #dfe3e9); display: block; }
    .ps-err { color: #d1343b; font-size: 13px; } .ps-act { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 14px; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
  `]
})
export class PaymentSuccessComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private pdf = inject(PdfService);

  @Input({ required: true }) sale!: Sale;
  /** Amount paid just now (sale total, first payment, or the loan repayment). Defaults to what is paid so far. */
  @Input() paidAmount: number | null = null;
  /** Local preview of the screenshot the salesperson attached (salespeople cannot download it from the server). */
  @Input() attachmentUrl: string | null = null;
  @Output() closed = new EventEmitter<void>();

  readonly phase = signal<'check' | 'receipt'>('check');
  readonly imgUrl = signal<string | null>(null);
  readonly error = signal('');
  private timer: any;
  private fetchedUrl: string | null = null;

  get paid(): number { return this.paidAmount ?? this.sale.amountPaid; }
  get showVat(): boolean { return (this.sale.vatTotal ?? 0) > 0; }

  ngOnInit(): void {
    this.imgUrl.set(this.attachmentUrl);
    if (!this.attachmentUrl) {
      // Admins can open stored screenshots; for anyone else this quietly stays empty
      const path = this.sale.payments.map(p => p.receiptImagePath).filter(Boolean).pop();
      if (path) this.api.proofImage(path).subscribe({
        next: b => { this.fetchedUrl = URL.createObjectURL(b); this.imgUrl.set(this.fetchedUrl); },
        error: () => { /* not allowed or not found: show no picture */ }
      });
    }
    this.timer = setTimeout(() => this.phase.set('receipt'), 2000);   // the check mark stays 2 seconds
  }

  print(): void { this.pdf.print(this.api.receiptPdf(this.sale.id), e => this.error.set(errMsg(e))); }
  download(): void { this.pdf.download(this.api.receiptPdf(this.sale.id), `${this.sale.invoiceNo}.pdf`, e => this.error.set(errMsg(e))); }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    if (this.fetchedUrl) URL.revokeObjectURL(this.fetchedUrl);
  }
}