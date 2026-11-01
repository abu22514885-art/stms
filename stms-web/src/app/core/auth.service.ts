import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_URL } from './config';
import { AuthUser, LoginResponse } from './models';

const KEY = 'stms.auth';

function readStored(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as AuthUser;
    return isExpired(u.token) ? null : u;
  } catch {
    return null;
  }
}

// JWT "exp" is in seconds
function isExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly _user = signal<AuthUser | null>(readStored());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'Admin');

  token(): string | null {
    return this._user()?.token ?? null;
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_URL}/api/auth/login`, { username, password }).pipe(
      tap(r => {
        const u: AuthUser = { token: r.token, fullName: r.fullName, role: r.role };
        try { localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* private mode */ }
        this._user.set(u);
      })
    );
  }

  requestPasswordReset(username: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_URL}/api/auth/password-reset-request`, { username, newPassword });
  }

  logout(): void {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    this._user.set(null);
    this.router.navigate(['/login']);
  }
}
