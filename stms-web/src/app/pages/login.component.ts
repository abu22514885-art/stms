import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { AuthService } from '../core/auth.service';
import { errMsg } from '../core/util';
import { LangToggleComponent } from '../shared/lang-toggle.component';
import { TPipe } from '../core/t.pipe';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LangToggleComponent, NgIcon, TPipe, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <section class="auth-showcase" aria-label="Stock Manager">
        <div class="auth-brand">
          <span class="brand-mark"><ng-icon name="lucideBoxes" size="22"></ng-icon></span>
          <span>{{ 'Stock Manager' | t }}</span>
        </div>
        <div class="auth-showcase-center">
          <span class="auth-index">STMS <i></i> INVENTORY OPERATIONS</span>
          <div class="auth-art" aria-hidden="true">
            <div class="art-column art-column-one"><span></span><span></span><span></span></div>
            <div class="art-column art-column-two"><span></span><span></span><span></span></div>
            <div class="art-column art-column-three"><span></span><span></span><span></span></div>
            <div class="art-emblem"><ng-icon name="lucideBoxes" size="34"></ng-icon></div>
            <div class="art-stamp">STOCK<br>01 / 04</div>
          </div>
        </div>
        <div class="auth-showcase-foot"><span>STOCK / SALES / CONTROL</span><span>LOCAL WORKSPACE&nbsp;&nbsp;·&nbsp;&nbsp;01</span></div>
      </section>
      <div class="auth-card">
        <div class="auth-lang"><app-lang-toggle></app-lang-toggle></div>
        @if (!resetMode()) {
          <span class="auth-eyebrow">{{ 'Welcome back' | t }}</span>
          <h1>{{ 'Stock Manager' | t }}</h1>
          <p class="muted">{{ 'Sign in to continue' | t }}</p>

          <div class="field">
            <label for="u">{{ 'Username' | t }}</label>
            <input id="u" type="text" autocomplete="username" [(ngModel)]="username" (keyup.enter)="submit()">
          </div>
          <div class="field">
            <label for="p">{{ 'Password' | t }}</label>
            <div class="password-field">
              <input id="p" [type]="showPassword() ? 'text' : 'password'" autocomplete="current-password" [(ngModel)]="password" (keyup.enter)="submit()">
              <button type="button" class="password-toggle" (click)="showPassword.set(!showPassword())" [attr.aria-label]="(showPassword() ? 'Hide password' : 'Show password') | t" [title]="(showPassword() ? 'Hide password' : 'Show password') | t">
                <ng-icon [name]="showPassword() ? 'lucideEyeOff' : 'lucideEye'" size="19"></ng-icon>
              </button>
            </div>
            <button type="button" class="auth-forgot" (click)="openReset()">{{ 'Forgot password?' | t }}</button>
          </div>

          @if (error()) { <div class="alert error">{{ error() | t }}</div> }

          <button type="button" class="btn primary block" [disabled]="busy()" (click)="submit()">
            {{ (busy() ? 'Signing in...' : 'Sign in') | t }}
          </button>
          <p class="muted center">{{ 'New salesperson?' | t }} <a routerLink="/register">{{ 'Request an account' | t }}</a></p>
        } @else {
          <span class="auth-eyebrow">{{ 'ACCOUNT RECOVERY' | t }}</span>
          <h1>{{ 'Reset password' | t }}</h1>
          <p class="muted">{{ 'Choose a new password. An admin must approve the request before it takes effect.' | t }}</p>

          <div class="field">
            <label for="reset-u">{{ 'Username' | t }}</label>
            <input id="reset-u" type="text" autocomplete="username" [(ngModel)]="username" (keyup.enter)="submitReset()">
          </div>
          <div class="field">
            <label for="new-p">{{ 'New password' | t }}</label>
            <div class="password-field">
              <input id="new-p" [type]="showNewPassword() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="newPassword" (keyup.enter)="submitReset()">
              <button type="button" class="password-toggle" (click)="showNewPassword.set(!showNewPassword())" [attr.aria-label]="(showNewPassword() ? 'Hide password' : 'Show password') | t" [title]="(showNewPassword() ? 'Hide password' : 'Show password') | t">
                <ng-icon [name]="showNewPassword() ? 'lucideEyeOff' : 'lucideEye'" size="19"></ng-icon>
              </button>
            </div>
          </div>
          <div class="field">
            <label for="confirm-p">{{ 'Confirm new password' | t }}</label>
            <div class="password-field">
              <input id="confirm-p" [type]="showConfirmPassword() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="confirmPassword" (keyup.enter)="submitReset()">
              <button type="button" class="password-toggle" (click)="showConfirmPassword.set(!showConfirmPassword())" [attr.aria-label]="(showConfirmPassword() ? 'Hide password' : 'Show password') | t" [title]="(showConfirmPassword() ? 'Hide password' : 'Show password') | t">
                <ng-icon [name]="showConfirmPassword() ? 'lucideEyeOff' : 'lucideEye'" size="19"></ng-icon>
              </button>
            </div>
          </div>

          @if (resetMessage()) { <div class="alert success">{{ resetMessage() | t }}</div> }
          @if (resetError()) { <div class="alert error">{{ resetError() | t }}</div> }

          <button type="button" class="btn primary block" [disabled]="resetBusy() || !!resetMessage()" (click)="submitReset()">
            {{ (resetBusy() ? 'Sending request...' : 'Send reset request') | t }}
          </button>
          <button type="button" class="auth-back" (click)="returnToLogin()">{{ 'Back to sign in' | t }}</button>
        }
      </div>
    </div>
  `
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  newPassword = '';
  confirmPassword = '';
  readonly showPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly resetMode = signal(false);
  readonly resetBusy = signal(false);
  readonly resetError = signal('');
  readonly resetMessage = signal('');
  readonly error = signal('');
  readonly busy = signal(false);

  submit(): void {
    if (!this.username.trim() || !this.password) { this.error.set('Enter your username and password.'); return; }
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => { this.busy.set(false); this.router.navigate(['/dashboard']); },
      error: e => { this.error.set(errMsg(e)); this.busy.set(false); }
    });
  }

  openReset(): void {
    this.resetError.set('');
    this.resetMessage.set('');
    this.resetMode.set(true);
  }

  returnToLogin(): void {
    this.resetMode.set(false);
    this.resetError.set('');
    this.resetMessage.set('');
  }

  submitReset(): void {
    this.resetError.set('');
    if (this.username.trim().length < 3) { this.resetError.set('Enter your username.'); return; }
    if (this.newPassword.length < 8) { this.resetError.set('Password must be at least 8 characters.'); return; }
    if (this.newPassword !== this.confirmPassword) { this.resetError.set('Passwords do not match.'); return; }

    this.resetBusy.set(true);
    this.auth.requestPasswordReset(this.username, this.newPassword).subscribe({
      next: response => { this.resetMessage.set(response.message); this.resetBusy.set(false); },
      error: error => { this.resetError.set(errMsg(error)); this.resetBusy.set(false); }
    });
  }
}
