import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { VAT_RATE } from '../core/config';
import { Product } from '../core/models';
import { errMsg, r2 } from '../core/util';
import { PagerComponent } from '../shared/pager.component';
import { ModalComponent } from '../shared/modal.component';
import { TPipe } from '../core/t.pipe';

type StatusFilter = 'all' | 'Yellow' | 'Red';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [TPipe, FormsModule, DecimalPipe, ModalComponent, PagerComponent],
  template: `
    <div class="page-head">
      <h2>{{ 'Products' | t }}</h2>
      <button type="button" class="btn primary" (click)="openAdd()">{{ 'Add product' | t }}</button>
    </div>

    @if (error()) { <div class="alert error">{{ error() | t }}</div> }

    <div class="toolbar">
      <input type="search" [placeholder]="'Search by name or code' | t" [ngModel]="search()" (ngModelChange)="onSearch($event)">
      <div class="seg">
        <button type="button" class="seg-btn" [class.on]="filter() === 'all'" (click)="setFilter('all')">{{ 'All' | t }}</button>
        <button type="button" class="seg-btn" [class.on]="filter() === 'Yellow'" (click)="setFilter('Yellow')">{{ 'Low' | t }}</button>
        <button type="button" class="seg-btn" [class.on]="filter() === 'Red'" (click)="setFilter('Red')">{{ 'Out of stock' | t }}</button>
      </div>
    </div>

    @if (loading()) { <p class="muted">{{ 'Loading...' | t }}</p> }

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th></th><th>{{ 'Code' | t }}</th><th>{{ 'Name' | t }}</th>
            @if (auth.isAdmin()) { <th class="num">{{ 'Cost' | t }}</th> }
            <th class="num">{{ 'Price' | t }}</th><th class="num">{{ 'Price + VAT' | t }}</th><th class="num">{{ 'In stock' | t }}</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (p of filtered(); track p.id) {
            <tr>
              <td><span class="dot" [class.yellow]="p.stockStatus === 'Yellow'" [class.red]="p.stockStatus === 'Red'"></span></td>
              <td>{{ p.sku }}</td>
              <td>{{ p.name }}</td>
              @if (auth.isAdmin()) { <td class="num">{{ p.costPrice ?? 0 | number:'1.2-2' }}</td> }
              <td class="num">{{ p.price | number:'1.2-2' }}</td>
              <td class="num">{{ p.priceWithVat | number:'1.2-2' }}</td>
              <td class="num">{{ p.quantity }} <small class="muted">{{ 'of {n}' | t:{ n: p.stockedQuantity } }}</small></td>
              <td class="num nowrap">
                <button type="button" class="btn small" (click)="openRestock(p)">{{ 'Restock' | t }}</button>
                <button type="button" class="btn small" (click)="openAdjust(p)">{{ 'Adjust' | t }}</button>
                <button type="button" class="btn small" (click)="openEdit(p)">{{ 'Edit' | t }}</button>
                <button type="button" class="btn small danger" (click)="confirmDelete.set(p)">{{ 'Delete' | t }}</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (!loading() && filtered().length === 0) { <p class="muted pad">{{ 'No products found.' | t }}</p> }
    </div>
    <app-pager [page]="page()" [pageSize]="pageSize" [total]="total()" (pageChange)="goTo($event)"></app-pager>

    @if (showForm()) {
      <app-modal [title]="editing() ? 'Edit product' : 'Add product'" (closed)="showForm.set(false)">
        <div class="field">
          <label>{{ 'Code (SKU)' | t }}</label>
          @if (editing()) {
            <input type="text" [value]="editing()!.sku" readonly>
          } @else {
            <input type="text" [value]="'Assigned automatically on save' | t" readonly>
          }
        </div>
        <div class="field"><label>{{ 'Name' | t }}</label><input type="text" [(ngModel)]="form.name"></div>
        @if (auth.isAdmin()) {
          <div class="field"><label>{{ 'Cost price (what you paid)' | t }}</label><input type="number" min="0" step="0.01" [(ngModel)]="form.cost"></div>
        }
        <div class="field">
          <label>{{ 'Selling price (before VAT)' | t }}</label>
          <input type="number" min="0" step="0.01" [(ngModel)]="form.price">
          @if (form.price !== null && form.price >= 0) {
            <small class="muted">{{ 'VAT {p}% = {v}, price with VAT = {w}' | t:{ p: vatPercent, v: ((previewVat() | number:'1.2-2') ?? '0.00'), w: ((previewWithVat() | number:'1.2-2') ?? '0.00') } }}</small>
          }
        </div>
        @if (!editing()) {
          <div class="field"><label>{{ 'Quantity in stock' | t }}</label><input type="number" min="0" step="1" [(ngModel)]="form.quantity"></div>
        }
        @if (formError()) { <div class="alert error">{{ formError() | t }}</div> }
        <div class="modal-actions">
          <button type="button" class="btn ghost" (click)="showForm.set(false)">{{ 'Cancel' | t }}</button>
          <button type="button" class="btn primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving...' : 'Save' }}</button>
        </div>
      </app-modal>
    }

    @if (stock(); as s) {
      <app-modal [title]="((s.mode === 'restock' ? 'Restock' : 'Adjust stock') | t) + ': ' + s.product.name" [width]="440" (closed)="stock.set(null)">
        <p class="muted">{{ 'Now in stock: {n}' | t:{ n: s.product.quantity } }}</p>
        @if (s.mode === 'restock') {
          <div class="field"><label>{{ 'Quantity to add' | t }}</label><input type="number" min="1" step="1" [(ngModel)]="stockQty"></div>
          <p class="muted">{{ 'After a restock, the low-stock alert counts from the new total.' | t }}</p>
        } @else {
          <div class="field"><label>{{ 'Change (use a minus for removing, e.g. -3)' | t }}</label><input type="number" step="1" [(ngModel)]="stockQty"></div>
          <div class="field">
            <label>{{ 'Reason' | t }}</label>
            <select [(ngModel)]="stockReason">
              <option value="Adjustment">{{ 'Correction' | t }}</option>
              <option value="Damage">{{ 'Damaged or lost' | t }}</option>
            </select>
          </div>
        }
        @if (formError()) { <div class="alert error">{{ formError() | t }}</div> }
        <div class="modal-actions">
          <button type="button" class="btn ghost" (click)="stock.set(null)">{{ 'Cancel' | t }}</button>
          <button type="button" class="btn primary" [disabled]="saving()" (click)="saveStock()">{{ 'Save' | t }}</button>
        </div>
      </app-modal>
    }

    @if (confirmDelete(); as p) {
      <app-modal [title]="'Delete product' | t" [width]="420" (closed)="confirmDelete.set(null)">
        <p><strong>{{ p.name }}</strong>: {{ 'Delete this product? Past sales keep their records.' | t }}</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" (click)="confirmDelete.set(null)">{{ 'Cancel' | t }}</button>
          <button type="button" class="btn danger" (click)="doDelete(p)">{{ 'Delete' | t }}</button>
        </div>
      </app-modal>
    }
  `
})
export class ProductsComponent implements OnInit {
  private api = inject(ApiService);
  private notes = inject(NotificationService);
  readonly auth = inject(AuthService);

  readonly vatPercent = VAT_RATE * 100;

  readonly items = signal<Product[]>([]);
  readonly search = signal('');
  readonly filter = signal<StatusFilter>('all');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly formError = signal('');

  // The server does the searching, the status filter and the paging
  readonly filtered = computed(() => this.items());
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 20;
  private searchTimer: any;

  // add / edit form
  readonly showForm = signal(false);
  readonly editing = signal<Product | null>(null);
  form: { sku: string; name: string; cost: number | null; price: number | null; quantity: number | null } =
    { sku: '', name: '', cost: null, price: null, quantity: null };

  // restock / adjust
  readonly stock = signal<{ product: Product; mode: 'restock' | 'adjust' } | null>(null);
  stockQty: number | null = null;
  stockReason = 'Adjustment';

  readonly confirmDelete = signal<Product | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void {
    const f = this.filter();
    this.api.products({
      search: this.search().trim(), status: f === 'all' ? undefined : f, page: this.page(), pageSize: this.pageSize
    }).subscribe({
      next: r => {
        // The last row of the last page was removed: step back one page
        if (r.items.length === 0 && r.total > 0 && this.page() > 1) { this.page.set(this.page() - 1); this.load(); return; }
        this.items.set(r.items); this.total.set(r.total); this.loading.set(false);
      },
      error: e => { this.error.set(errMsg(e)); this.loading.set(false); }
    });
  }

  onSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.load(); }, 300);
  }

  setFilter(f: StatusFilter): void { this.filter.set(f); this.page.set(1); this.load(); }
  goTo(p: number): void { this.page.set(p); this.load(); }

  previewVat(): number { return r2(r2(Number(this.form.price ?? 0)) * VAT_RATE); }
  previewWithVat(): number { return r2(Number(this.form.price ?? 0) + this.previewVat()); }

  openAdd(): void {
    this.editing.set(null);
    this.form = { sku: '', name: '', cost: null, price: null, quantity: null };
    this.formError.set('');
    this.showForm.set(true);
  }

  openEdit(p: Product): void {
    this.editing.set(p);
    this.form = { sku: p.sku, name: p.name, cost: p.costPrice, price: p.price, quantity: null };
    this.formError.set('');
    this.showForm.set(true);
  }

  save(): void {
    const f = this.form;
    if (!f.name.trim()) { this.formError.set('Enter the product name.'); return; }
    if (f.price === null || f.price < 0) { this.formError.set('Enter the selling price.'); return; }
    if (f.cost !== null && f.cost < 0) { this.formError.set('The cost price cannot be negative.'); return; }
    const qty = Math.floor(Number(f.quantity ?? 0));
    if (!this.editing() && qty < 0) { this.formError.set('The quantity cannot be negative.'); return; }

    const current = this.editing();
    const input = {
      name: f.name.trim(),
      categoryId: current?.categoryId ?? null,
      costPrice: this.auth.isAdmin() ? f.cost : null,
      price: f.price
    };

    this.saving.set(true);
    this.formError.set('');
    const call = current
      ? this.api.updateProduct(current.id, { ...input, sku: current.sku })
      : this.api.createProduct({ ...input, quantity: qty });
    call.subscribe({
      next: () => { this.saving.set(false); this.showForm.set(false); this.load(); this.notes.refresh(); },
      error: e => { this.formError.set(errMsg(e)); this.saving.set(false); }
    });
  }

  openRestock(p: Product): void { this.stockQty = null; this.formError.set(''); this.stock.set({ product: p, mode: 'restock' }); }
  openAdjust(p: Product): void { this.stockQty = null; this.stockReason = 'Adjustment'; this.formError.set(''); this.stock.set({ product: p, mode: 'adjust' }); }

  saveStock(): void {
    const s = this.stock();
    if (!s) return;
    const qty = Math.trunc(Number(this.stockQty ?? 0));
    if (qty === 0 || (s.mode === 'restock' && qty < 0)) {
      this.formError.set(s.mode === 'restock' ? 'Enter a quantity above 0.' : 'Enter a change that is not 0.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    const call = s.mode === 'restock'
      ? this.api.restock(s.product.id, qty)
      : this.api.adjustStock(s.product.id, qty, this.stockReason);
    call.subscribe({
      next: () => { this.saving.set(false); this.stock.set(null); this.load(); this.notes.refresh(); },
      error: e => { this.formError.set(errMsg(e)); this.saving.set(false); }
    });
  }

  doDelete(p: Product): void {
    this.api.deleteProduct(p.id).subscribe({
      next: () => { this.confirmDelete.set(null); this.load(); this.notes.refresh(); },
      error: e => { this.error.set(errMsg(e)); this.confirmDelete.set(null); }
    });
  }
}
