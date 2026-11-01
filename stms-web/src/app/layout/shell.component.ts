import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { PushNotificationService } from '../core/push-notification.service';
import { AuthService } from '../core/auth.service';
import { ClockComponent } from '../shared/clock.component';
import { LangToggleComponent } from '../shared/lang-toggle.component';
import { NotificationBellComponent } from '../shared/notification-bell.component';
import { TPipe } from '../core/t.pipe';

interface MenuItem { path: string; label: string; icon: string; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [TPipe, NgIcon, RouterOutlet, RouterLink, RouterLinkActive, NotificationBellComponent, ClockComponent, LangToggleComponent],
  template: `
    <div class="shell" [class.nav-open]="navOpen()">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark"><ng-icon name="lucideBoxes" size="21"></ng-icon></span>
          <span class="brand-copy">{{ 'Stock Manager' | t }}<small>STMS / OPERATIONS</small></span>
        </div>
        <nav>
          @for (item of menu(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" (click)="navOpen.set(false)">
              <ng-icon class="nav-icon" [name]="item.icon" size="18"></ng-icon>
              <span class="nav-label">{{ item.label | t }}</span>
              <span class="nav-current"></span>
            </a>
          }
        </nav>
        <div class="sidebar-foot"><span class="sidebar-foot-mark"></span><span>STOCK OPERATIONS<small>LOCAL WORKSPACE</small></span></div>
      </aside>
      <div class="scrim" (click)="navOpen.set(false)"></div>

      <div class="main">
        <header class="topbar">
          <button type="button" class="icon-btn menu-btn" (click)="navOpen.set(!navOpen())" [aria-label]="'Menu' | t" [title]="'Menu' | t"><ng-icon name="lucideMenu" size="20"></ng-icon></button>
          <div class="spacer"></div>
          <app-clock class="clock-wrap"></app-clock>
          <app-lang-toggle></app-lang-toggle>
          <div class="push-controls">
            <button type="button" class="btn ghost push-toggle" [class.on]="push.subscribed()" [disabled]="push.busy()" (click)="push.toggle()" [title]="(push.subscribed() ? 'Push notifications on' : 'Enable push notifications') | t">
              <ng-icon name="lucideBellRing" size="17"></ng-icon>
              <span>{{ push.subscribed() ? 'Alerts on' : 'Enable alerts' | t }}</span>
            </button>
            @if (push.feedback()) { <span class="push-feedback">{{ push.feedback() | t }}</span> }
          </div>
          <app-notification-bell></app-notification-bell>
          <div class="who">
            <strong>{{ auth.user()?.fullName }}</strong>
            <span class="role">{{ auth.user()?.role }}</span>
          </div>
          <button type="button" class="btn ghost logout-btn" (click)="auth.logout()"><ng-icon name="lucideLogOut" size="17"></ng-icon>{{ 'Log out' | t }}</button>
        </header>
        <main class="content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly push = inject(PushNotificationService);
  readonly navOpen = signal(false);

  readonly menu = computed<MenuItem[]>(() =>
    this.auth.isAdmin()
      ? [
          { path: '/dashboard', label: 'Dashboard', icon: 'lucideLayoutDashboard' },
          { path: '/sell', label: 'Sell', icon: 'lucideShoppingCart' },
          { path: '/products', label: 'Products', icon: 'lucidePackage' },
          { path: '/sales', label: 'Sales', icon: 'lucideReceiptText' },
          { path: '/loans', label: 'Loans', icon: 'lucideHandCoins' },
          { path: '/reports', label: 'Reports', icon: 'lucideChartNoAxesCombined' },
          { path: '/users', label: 'Users', icon: 'lucideUsers' },
          { path: '/settings', label: 'Settings', icon: 'lucideSettings' }
        ]
      : [
          { path: '/dashboard', label: 'Dashboard', icon: 'lucideLayoutDashboard' },
          { path: '/sell', label: 'Sell', icon: 'lucideShoppingCart' },
          { path: '/products', label: 'Products', icon: 'lucidePackage' },
          { path: '/sales', label: "Today's sales", icon: 'lucideReceiptText' },
          { path: '/loans', label: 'Loans', icon: 'lucideHandCoins' }
        ]
  );
}
