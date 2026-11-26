import { Pipe, PipeTransform } from '@angular/core';


// Display only. The number itself is never changed: fmtNumber(2500000.5, 2) = "2,500,000.50".
export function fmtNumber(v: number | string | null | undefined, decimals = 2): string {
  const n = v === null || v === undefined || v === '' ? NaN : Number(v);
  if (!Number.isFinite(n)) return '';
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const out = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
  return n < 0 && Number(fixed) !== 0 ? '-' + out : out;
}

export function fmtMoney(v: number | string | null | undefined, currency = 'ETB', decimals = 2): string {
  const s = fmtNumber(v, decimals);
  if (s === '') return '';
  return s.startsWith('-') ? `-${currency} ${s.slice(1)}` : `${currency} ${s}`;
}

// {{ total | money }} -> "ETB 1,234.50"     {{ qty | money:'':0 }} -> "1,234"     {{ x | money:'' }} -> "1,234.50"
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(v: number | string | null | undefined, currency = 'ETB', decimals = 2): string {
    return currency ? fmtMoney(v, currency, decimals) : fmtNumber(v, decimals);
  }
}