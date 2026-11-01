import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { StockNotification } from './models';

// Low-stock alerts for the bell in the top bar: Green = fine, Yellow = low, Red = out of stock.
@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  private readonly _data = signal<StockNotification | null>(null);
  readonly level = computed(() => this._data()?.level ?? 'Green');
  readonly count = computed(() => this._data()?.count ?? 0);
  readonly items = computed(() => this._data()?.items ?? []);

  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.refresh();
    if (this.timer === null) this.timer = setInterval(() => this.refresh(), 60000);
  }

  refresh(): void {
    if (!this.auth.isLoggedIn()) return;
    this.api.lowStock().subscribe({
      next: d => this._data.set(d),
      error: () => { /* the bell just keeps its last state */ }
    });
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }
}
