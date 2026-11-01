import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { PaymentDraft, PaymentMethod, Provider } from '../core/models';
import { errMsg, r2 } from '../core/util';
import { TPipe } from '../core/t.pipe';

// How the customer paid. Cash needs nothing more. Bank or wallet needs the bank/wallet,
// the transaction reference ID and a screenshot of the receipt.
@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [TPipe, FormsModule],
  template: `
    <div class="field">
      <label>{{ 'Payment method' | t }}</label>
      <div class="seg">
        @for (m of methods; track m.id) {
          <button type="button" class="seg-btn" [class.on]="methodId === m.id" (click)="pick(m.id)">{{ m.name | t }}</button>
        }
      </div>
    </div>

    @if (needsProof) {
      <div class="field">
        <label>{{ 'Bank / wallet used' | t }}</label>
        <select [ngModel]="providerId" (ngModelChange)="providerId = $event; emit()">
          <option [ngValue]="null">{{ 'Select...' | t }}</option>
          @for (p of providers; track p.id) {
            <option [ngValue]="p.id">{{ p.name }}</option>
          }
        </select>
        @if (providers.length === 0) {
          <small class="warn-text">{{ 'No banks or wallets are set up yet. Ask the admin to add them in Settings.' | t }}</small>
        }
      </div>

      <div class="field">
        <label>{{ 'Transaction reference ID' | t }}</label>
        <input type="text" maxlength="100" [ngModel]="ref" (ngModelChange)="ref = $event; emit()" [placeholder]="'e.g. FT26300ABC' | t">
      </div>

      <div class="field">
        <label>{{ 'Receipt screenshot' | t }}</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" (change)="onFile($event)">
        @if (uploading()) { <small class="muted">{{ 'Uploading...' | t }}</small> }
        @if (uploadError()) { <small class="error-text">{{ uploadError() | t }}</small> }
        @if (previewUrl()) { <img class="proof-preview" [src]="previewUrl()" alt="Receipt screenshot"> }
      </div>
    }

    @if (editable) {
      <div class="field">
        <label>{{ 'Amount paid' | t }}</label>
        <input type="number" min="0" step="0.01" [ngModel]="amountValue" (ngModelChange)="onAmount($event)">
      </div>
    }
  `
})
export class PaymentFormComponent implements OnChanges {
  private api = inject(ApiService);

  @Input() methods: PaymentMethod[] = [];
  /** Fixed amount (when not editable) or the starting amount */
  @Input() amount = 0;
  @Input() editable = false;
  @Output() draftChange = new EventEmitter<PaymentDraft>();

  methodId: number | null = null;
  providerId: number | null = null;
  ref = '';
  amountValue: number | null = null;
  imagePath: string | null = null;

  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly previewUrl = signal('');

  get method(): PaymentMethod | undefined { return this.methods.find(m => m.id === this.methodId); }
  get needsProof(): boolean { return !!this.method && this.method.type !== 'Cash'; }
  get providers(): Provider[] { return this.method?.providers ?? []; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['methods'] && this.methodId === null && this.methods.length > 0) {
      this.methodId = this.methods[0].id;     // Cash is listed first
    }
    if (changes['amount'] || changes['editable']) {
      this.amountValue = this.amount > 0 ? this.amount : null;
    }
    this.emit();
  }

  pick(id: number): void {
    this.methodId = id;
    this.providerId = null;
    this.ref = '';
    this.clearProof();
    this.emit();
  }

  onAmount(v: number | null): void {
    this.amountValue = v;
    this.emit();
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadError.set('');
    this.uploading.set(true);
    this.api.uploadProof(file).subscribe({
      next: r => {
        this.imagePath = r.path;
        this.previewUrl.set(URL.createObjectURL(file));
        this.uploading.set(false);
        this.emit();
      },
      error: e => {
        this.imagePath = null;
        this.uploadError.set(errMsg(e));
        this.uploading.set(false);
        this.emit();
      }
    });
  }

  /** Called by the page after a sale is saved */
  reset(): void {
    this.methodId = this.methods.length > 0 ? this.methods[0].id : null;
    this.providerId = null;
    this.ref = '';
    this.amountValue = this.amount > 0 ? this.amount : null;
    this.clearProof();
    this.emit();
  }

  private clearProof(): void {
    this.imagePath = null;
    this.previewUrl.set('');
    this.uploadError.set('');
  }

  emit(): void {
    const amount = r2(Number(this.amountValue ?? 0));
    let problem = '';
    if (!this.method) problem = 'Choose a payment method.';
    else if (!(amount > 0)) problem = 'Enter the amount paid.';
    else if (this.needsProof) {
      if (this.providerId === null) problem = 'Choose the bank or wallet.';
      else if (!this.ref.trim()) problem = 'Enter the transaction reference ID.';
      else if (!this.imagePath) problem = 'Upload the receipt screenshot.';
    }

    const draft: PaymentDraft = {
      valid: problem === '',
      problem,
      request: problem === '' && this.method ? {
        paymentMethodId: this.method.id,
        paymentProviderId: this.needsProof ? this.providerId : null,
        transactionRef: this.needsProof ? this.ref.trim() : null,
        receiptImagePath: this.needsProof ? this.imagePath : null,
        amount
      } : null
    };
    // Sent after the current check, so the page behind it is never changed mid-render
    queueMicrotask(() => this.draftChange.emit(draft));
  }
}
