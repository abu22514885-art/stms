import { Component, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { SalesDashboardComponent } from './sales-dashboard.component';

// One address (/dashboard), a different screen for each role
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [AdminDashboardComponent, SalesDashboardComponent],
  template: `
    @if (auth.isAdmin()) { <app-admin-dashboard></app-admin-dashboard> }
    @else { <app-sales-dashboard></app-sales-dashboard> }
  `
})
export class DashboardPageComponent {
  readonly auth = inject(AuthService);
}
