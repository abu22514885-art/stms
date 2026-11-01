import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';
import { ShellComponent } from './layout/shell.component';
import { LoginComponent } from './pages/login.component';
import { RegisterComponent } from './pages/register.component';
import { DashboardPageComponent } from './pages/dashboard.page';
import { SellComponent } from './pages/sell.component';
import { ProductsComponent } from './pages/products.component';
import { SalesListComponent } from './pages/sales-list.component';
import { LoansComponent } from './pages/loans.component';
import { ReportsComponent } from './pages/reports.component';
import { UsersComponent } from './pages/users.component';
import { SettingsComponent } from './pages/settings.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardPageComponent },
      { path: 'sell', component: SellComponent },
      { path: 'products', component: ProductsComponent },
      { path: 'sales', component: SalesListComponent },
      { path: 'loans', component: LoansComponent },
      { path: 'reports', component: ReportsComponent, canActivate: [adminGuard] },
      { path: 'users', component: UsersComponent, canActivate: [adminGuard] },
      { path: 'settings', component: SettingsComponent, canActivate: [adminGuard] },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
