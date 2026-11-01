import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { PdfService } from '../core/pdf.service';
import { NotificationService } from '../core/notification.service';
import { VAT_RATE } from '../core/config';
import { CreateSaleRequest, CreateSaleResponse, PaymentDraft, PaymentMethod, Product } from '../core/models';
import { errMsg, r2 } from '../core/util';
import { PagerComponent } from '../shared/pager.component';
import { ModalComponent } from '../shared/modal.component';
import { PaymentFormComponent } from '../shared/payment-form.component';
import { TPipe } from '../core/t.pipe';

interface CartLine { product: Product; qty: number; }

@Component({
  selector: 'app-sell',
  standalone: true,
  imports: [TPipe, FormsModule, DecimalPipe, ModalComponent, PaymentFormComponent, PagerComponent],
  template: `
    <div class="page-head"><h2>{{ 'New sale' | t }}</h2></div>
    @if (error()) { <div class="alert error">{{ error() | t }}</div> }

    <div class="sell-layout">
      <!-- Products -->
      <div class="card">
        <input type="search" [placeholder]="'Search products by name or code' | t" [ngModel]="search()" (ngModelChange)="onSearch($event)">
        @if (loading()) { <p class="muted">{{ 'Loading products...' | t }}</p> }
        <div class="product-grid">
          @for (p of filtered(); track p.id) {
            <button type="button" class="product-tile" [disabled]="p.quantity <= 0" (click)="add(p)">
              <span class="pt-name">{{ p.name }}</span>
              <span class="pt-price">{{ unitPrice(p) | number:'1.2-2' }}</span>
              <span class="pt-stock">
                <span class="dot" [class.yellow]="p.stockStatus === 'Yellow'" [class.red]="p.stockStatus === 'Red'"></span>
                {{ (p.quantity > 0 ? '{n} in stock' : 'Out of stock') | t:{ n: p.quantity } }}
              </span>
            </button>
          }
        </div>
        @if (!loading() && filtered().length === 0) { <p class="muted">{{ 'No products found.' | t }}</p> }
        <app-pager [page]="page()" [pageSize]="pageSize" [total]="productTotal()" (pageChange)="goTo($event)"></app-pager>
      </div>

      <!-- Cart -->
      <div class="card cart">
        <h3>{{ 'Items' | t }}</h3>
        @if (cart().length === 0) { <p class="muted">{{ 'Tap a product to add it.' | t }}</p> }
        @for (l of cart(); track l.product.id) {
          <div class="cart-line">
            <div class="cl-name">
              <strong>{{ l.product.name }}</strong>
              <small class="muted">{{ '{n} each' | t:{ n: ((unitPrice(l.product) | number:'1.2-2') ?? '0.00') } }}</small>
            </div>
            <div class="qty">
              <button type="button" class="icon-btn" (click)="setQty(l, l.qty - 1)" [aria-label]="'Less' | t">&minus;</button>
              <input type="number" min="1" [max]="l.product.quantity" [ngModel]="l.qty" (ngModelChange)="setQty(l, $event)">
              <button type="button" class="icon-btn" (click)="setQty(l, l.qty + 1)" [aria-label]="'More' | t">+</button>
            </div>
            <div class="cl-total">{{ l.qty * unitPrice(l.product) | number:'1.2-2' }}</div>
            <button type="button" class="icon-btn" (click)="remove(l)" [aria-label]="'Remove' | t">&#10005;</button>
          </div>
        }

        <label class="check">
          <input type="checkbox" [ngModel]="wantsReceipt()" (ngModelChange)="wantsReceipt.set($event)">
          {{ 'Customer wants a receipt (adds {n}% VAT)' | t:{ n: vatPercent } }}
        </label>

        <div class="totals">
          <div><span>{{ 'Subtotal' | t }}</span><span>{{ subtotal() | number:'1.2-2' }}</span></div>
          @if (wantsReceipt()) { <div><span>{{ 'VAT {n}%' | t:{ n: vatPercent } }}</span><span>{{ vat() | number:'1.2-2' }}</span></div> }
          <div class="grand"><span>{{ 'Total' | t }}</span><span>{{ total() | number:'1.2-2' }}</span></div>
        </div>

        <div class="field">
          <label>{{ 'Sale type' | t }}</label>
          <div class="seg">
            <button type="button" class="seg-btn" [class.on]="!isLoan()" (click)="setLoan(false)">{{ 'Paid now' | t }}</button>
            <button type="button" class="seg-btn" [class.on]="isLoan()" (click)="setLoan(true)">{{ 'Loan (pay later)' | t }}</button>
          </div>
        </div>

        @if (isLoan()) {
          <div class="field">
            <label>{{ 'Customer full name' | t }}</label>
            <input type="text" [ngModel]="customerName()" (ngModelChange)="customerName.set($event)">
          </div>
          <div class="field">
            <label>{{ 'Customer phone' | t }}</label>
            <input type="tel" placeholder="0911223344" [ngModel]="customerPhone()" (ngModelChange)="customerPhone.set($event)">
          </div>
          <label class="check">
            <input type="checkbox" [ngModel]="firstPayment()" (ngModelChange)="firstPayment.set($event)">
            {{ 'Customer pays part of it now' | t }}
          </label>
          <p class="muted">{{ 'Amount to be paid later:' | t }} <strong>{{ owedLater() | number:'1.2-2' }}</strong></p>
        }

        @if (!isLoan() || firstPayment()) {
          <app-payment-form [methods]="methods()" [amount]="isLoan() ? 0 : total()" [editable]="isLoan()"
                            (draftChange)="draft.set($event)"></app-payment-form>
        }

        @if (blockReason()) { <p class="muted">{{ blockReason() | t }}</p> }
        <button type="button" class="btn primary block big" [disabled]="!canSell() || busy()" (click)="sell()">
          {{ busy() ? 'Saving...' : (isLoan() ? 'Save loan sale' : 'Complete sale') }}
        </button>
      </div>
    </div>

    @if (result(); as r) {
      <app-modal [title]="'Sale complete' | t" [width]="460" (closed)="result.set(null)">
        <p>{{ 'Invoice' | t }} <strong>{{ r.sale.invoiceNo }}</strong></p>
        <p class="big-number">{{ r.sale.total | number:'1.2-2' }}</p>
        @if (r.sale.isLoan) { <p class="muted">{{ 'Loan: {a} still to be paid by {b}.' | t:{ a: ((r.sale.balance | number:'1.2-2') ?? '0.00'), b: (r.sale.customer?.fullName ?? '') } }}</p> }
        <div class="modal-actions wrap">
          <button type="button" class="btn primary" (click)="print(r)">{{ 'Print receipt' | t }}</button>
          <button type="button" class="btn" (click)="download(r)">{{ 'Download PDF' | t }}</button>
          <button type="button" class="btn ghost" (click)="result.set(null)">{{ 'New sale' | t }}</button>
        </div>
      </app-modal>
    }
  `
})
export class SellComponent implements OnInit {
  private api = inject(ApiService);
  private pdf = inject(PdfService);
  private notes = inject(NotificationService);

  readonly vatPercent = VAT_RATE * 100;

  readonly products = signal<Product[]>([]);
  readonly methods = signal<PaymentMethod[]>([]);
  readonly search = signal('');
  readonly cart = signal<CartLine[]>([]);
  readonly wantsReceipt = signal(false);
  readonly isLoan = signal(false);
  readonly firstPayment = signal(false);
  readonly customerName = signal('');
  readonly customerPhone = signal('');
  readonly draft = signal<PaymentDraft | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly result = signal<CreateSaleResponse | null>(null);

  @ViewChild(PaymentFormComponent) payForm?: PaymentFormComponent;

  // The server does the searching and paging; the cart keeps its own copy of each chosen product
  readonly filtered = computed(() => this.products());
  readonly page = signal(1);
  readonly productTotal = signal(0);
  readonly pageSize = 24;
  private searchTimer: any;

  readonly subtotal = computed(() => r2(this.cart().reduce((s, l) => s + l.qty * l.product.price, 0)));
  readonly vat = computed(() => this.wantsReceipt()
    ? r2(this.cart().reduce((s, l) => s + l.qty * l.product.vatAmount, 0)) : 0);
  readonly total = computed(() => r2(this.subtotal() + this.vat()));

  readonly owedLater = computed(() => {
    const paid = this.firstPayment() ? (this.draft()?.request?.amount ?? 0) : 0;
    return Math.max(0, r2(this.total() - paid));
  });

  readonly blockReason = computed(() => {
    if (this.cart().length === 0) return 'Add at least one item.';
    if (this.isLoan()) {
      if (!this.customerName().trim()) return 'Enter the customer full name.';
      if (this.customerPhone().replace(/\D/g, '').length < 7) return 'Enter the customer phone number.';
      if (this.firstPayment()) {
        const d = this.draft();
        if (!d || !d.valid) return d?.problem ?? 'Enter the payment details.';
        if ((d.request?.amount ?? 0) >= this.total()) return 'A loan must leave a balance. Turn off "pays part of it now" if it is fully paid.';
      }
      return '';
    }
    const d = this.draft();
    if (!d || !d.valid) return d?.problem ?? 'Choose how the customer paid.';
    return '';
  });
  readonly canSell = computed(() => this.blockReason() === '');

  ngOnInit(): void {
    this.reloadProducts();
    this.api.paymentMethods().subscribe({
      next: m => this.methods.set(m),
      error: e => this.error.set(errMsg(e))
    });
  }

  private reloadProducts(): void {
    this.api.products({ search: this.search().trim(), page: this.page(), pageSize: this.pageSize }).subscribe({
      next: r => { this.products.set(r.items); this.productTotal.set(r.total); this.loading.set(false); },
      error: e => { this.error.set(errMsg(e)); this.loading.set(false); }
    });
  }

  onSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.reloadProducts(); }, 300);
  }

  goTo(p: number): void { this.page.set(p); this.reloadProducts(); }

  unitPrice(p: Product): number { return this.wantsReceipt() ? p.priceWithVat : p.price; }

  add(p: Product): void {
    const existing = this.cart().find(l => l.product.id === p.id);
    if (existing) { this.setQty(existing, existing.qty + 1); return; }
    this.cart.update(c => [...c, { product: p, qty: 1 }]);
  }

  setQty(line: CartLine, value: number | null): void {
    const n = Math.floor(Number(value ?? 1));
    const qty = Math.min(Math.max(Number.isFinite(n) ? n : 1, 1), line.product.quantity);
    this.cart.update(c => c.map(l => l.product.id === line.product.id ? { ...l, qty } : l));
  }

  remove(line: CartLine): void {
    this.cart.update(c => c.filter(l => l.product.id !== line.product.id));
  }

  setLoan(v: boolean): void {
    this.isLoan.set(v);
    this.firstPayment.set(false);
  }

  sell(): void {
    const d = this.draft();
    const req: CreateSaleRequest = {
      items: this.cart().map(l => ({ productId: l.product.id, quantity: l.qty })),
      wantsReceipt: this.wantsReceipt(),
      isLoan: this.isLoan()
    };
    if (this.isLoan()) {
      req.customer = { fullName: this.customerName().trim(), phone: this.customerPhone().trim() };
      if (this.firstPayment() && d?.request) req.payments = [d.request];
    } else if (d?.request) {
      req.payments = [d.request];
    }

    this.busy.set(true);
    this.error.set('');
    this.api.createSale(req).subscribe({
      next: r => {
        this.result.set(r);
        this.busy.set(false);
        this.resetSale();
        this.reloadProducts();
        this.notes.refresh();
      },
      error: e => { this.error.set(errMsg(e)); this.busy.set(false); this.reloadProducts(); }
    });
  }

  private resetSale(): void {
    this.cart.set([]);
    this.wantsReceipt.set(false);
    this.isLoan.set(false);
    this.firstPayment.set(false);
    this.customerName.set('');
    this.customerPhone.set('');
    this.search.set('');
    this.payForm?.reset();
  }

  print(r: CreateSaleResponse): void {
    this.pdf.print(this.api.receiptPdf(r.sale.id), e => this.error.set(errMsg(e)));
  }

  download(r: CreateSaleResponse): void {
    this.pdf.download(this.api.receiptPdf(r.sale.id), `${r.sale.invoiceNo}.pdf`, e => this.error.set(errMsg(e)));
  }
}
