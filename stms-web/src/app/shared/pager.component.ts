import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TPipe } from '../core/t.pipe';

// Page buttons under a table: "21-40 of 134", Previous, 1 2 3 ... 7, Next
@Component({
  selector: 'app-pager',
  standalone: true,
  imports: [TPipe],
  template: `
    @if (total > 0) {
      <div class="pager">
        <span class="muted">{{ '{a}-{b} of {n}' | t:{ a: first, b: last, n: total } }}</span>
        @if (pages > 1) {
          <div class="pager-btns">
            <button type="button" class="btn small" [disabled]="page <= 1" (click)="go(page - 1)">{{ 'Previous' | t }}</button>
            @for (n of numbers; track $index) {
              @if (n === 0) { <span class="muted">...</span> }
              @else { <button type="button" class="btn small" [class.primary]="n === page" (click)="go(n)">{{ n }}</button> }
            }
            <button type="button" class="btn small" [disabled]="page >= pages" (click)="go(page + 1)">{{ 'Next' | t }}</button>
          </div>
        }
      </div>
    }
  `
})
export class PagerComponent {
  @Input() page = 1;
  @Input() pageSize = 20;
  @Input() total = 0;
  @Output() pageChange = new EventEmitter<number>();

  get pages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get first(): number { return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1; }
  get last(): number { return Math.min(this.page * this.pageSize, this.total); }

  // Page numbers to show; 0 means "..."
  get numbers(): number[] {
    const p = this.pages, c = this.page;
    const keep = new Set<number>([1, p, c - 1, c, c + 1].filter(n => n >= 1 && n <= p));
    const sorted = [...keep].sort((a, b) => a - b);
    const out: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push(0);
      out.push(sorted[i]);
    }
    return out;
  }

  go(n: number): void {
    if (n < 1 || n > this.pages || n === this.page) return;
    this.pageChange.emit(n);
  }
}
