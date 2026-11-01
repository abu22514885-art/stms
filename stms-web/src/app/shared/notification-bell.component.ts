import { Component, ElementRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificationService } from '../core/notification.service';
import { TPipe } from '../core/t.pipe';

// Bell with a traffic-light colour: green = all fine, yellow = low stock, red = something is out of stock.
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [TPipe, RouterLink],
  template: `
    <div class="bell-wrap">
      <button type="button" class="bell" [class.green]="notes.level() === 'Green'"
              [class.yellow]="notes.level() === 'Yellow'" [class.red]="notes.level() === 'Red'"
              (click)="open.set(!open())" [attr.aria-label]="'Stock alerts: ' + notes.count()">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5-6.7V3a2 2 0 0 0-4 0v1.3A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/>
        </svg>
        @if (notes.count() > 0) { <span class="badge-count">{{ notes.count() }}</span> }
      </button>

      @if (open()) {
        <div class="bell-panel">
          <div class="bell-title">{{ 'Stock alerts' | t }}</div>
          @if (notes.items().length === 0) {
            <p class="muted">{{ 'All stock levels are fine.' | t }}</p>
          }
          @for (i of notes.items(); track i.productId) {
            <div class="bell-item">
              <span class="dot" [class.yellow]="i.status === 'Yellow'" [class.red]="i.status === 'Red'"></span>
              <span>{{ i.message }}</span>
            </div>
          }
          <a routerLink="/products" (click)="open.set(false)">{{ 'Open products' | t }}</a>
        </div>
      }
    </div>
  `
})
export class NotificationBellComponent implements OnInit {
  readonly notes = inject(NotificationService);
  private host = inject(ElementRef);
  readonly open = signal(false);

  ngOnInit(): void { this.notes.start(); }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target)) this.open.set(false);
  }
}
