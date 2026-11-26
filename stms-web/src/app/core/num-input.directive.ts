import { Directive, ElementRef, Input, booleanAttribute, forwardRef, inject, numberAttribute } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Automatic thousands separators while typing: 1500000 -> 1,500,000 and 2500000.5 -> 2,500,000.50 (on leaving the field).
// The form value stays a plain number (or null), so calculations, validation and the API never see the commas.
//   <input type="text" appNum [(ngModel)]="price">                       money, 2 decimals
//   <input type="text" appNum decimals="0" [(ngModel)]="qty">            whole numbers
//   <input type="text" appNum decimals="0" allowNegative [(ngModel)]="x"> may start with a minus
@Directive({
  selector: 'input[appNum]',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumInputDirective), multi: true }],
  host: {
    '(input)': 'onInput()',
    '(blur)': 'onBlur()',
    '[attr.inputmode]': 'mode',
    autocomplete: 'off'
  }
})
export class NumInputDirective implements ControlValueAccessor {
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  @Input({ transform: numberAttribute }) decimals = 2;
  @Input({ transform: booleanAttribute }) allowNegative = false;

  private change: (v: number | null) => void = () => {};
  private touched: () => void = () => {};

  get mode(): string { return this.allowNegative ? 'text' : this.decimals > 0 ? 'decimal' : 'numeric'; }

  writeValue(v: unknown): void {
    const n = v === null || v === undefined || v === '' ? NaN : Number(v);
    this.el.nativeElement.value = Number.isFinite(n) ? this.group(this.fixed(n)) : '';
  }
  registerOnChange(fn: (v: number | null) => void): void { this.change = fn; }
  registerOnTouched(fn: () => void): void { this.touched = fn; }
  setDisabledState(disabled: boolean): void { this.el.nativeElement.disabled = disabled; }

  onInput(): void {
    const input = this.el.nativeElement;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const significant = raw.slice(0, caret).replace(/[^0-9.\-]/g, '').length;

    const clean = this.clean(raw);
    const shown = this.group(clean);
    if (shown !== raw) {
      input.value = shown;
      let pos = 0, seen = 0;
      while (pos < shown.length && seen < significant) { if (shown[pos] !== ',') seen++; pos++; }
      try { input.setSelectionRange(pos, pos); } catch { /* some mobile keyboards refuse: ignore */ }
    }
    this.change(this.toNumber(clean));
  }

  onBlur(): void {
    const clean = this.clean(this.el.nativeElement.value);
    const n = this.toNumber(clean);
    this.el.nativeElement.value = n === null ? '' : this.group(this.fixed(n));
    this.touched();
  }

  // Keep digits, one dot, and a leading minus (only when allowed). Cut extra decimals.
  private clean(raw: string): string {
    const negative = this.allowNegative && raw.trim().startsWith('-');
    let s = raw.replace(/[^0-9.]/g, '');
    const dot = s.indexOf('.');
    if (this.decimals <= 0) s = dot >= 0 ? s.slice(0, dot) : s;
    else if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, this.decimals);
    const [int, frac] = s.split('.');
    const trimmed = int.replace(/^0+(?=\d)/, '');
    return (negative ? '-' : '') + trimmed + (frac !== undefined ? '.' + frac : '');
  }

  private toNumber(clean: string): number | null {
    if (clean === '' || clean === '-' || clean === '.' || clean === '-.') return null;
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
  }

  private fixed(n: number): string { return this.decimals > 0 ? n.toFixed(this.decimals) : String(Math.trunc(n)); }

  private group(clean: string): string {
    if (clean === '') return '';
    const neg = clean.startsWith('-');
    const body = neg ? clean.slice(1) : clean;
    const [int, frac] = body.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + grouped + (frac !== undefined ? '.' + frac : '');
  }
}