import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errMsg } from '../core/util';
import { LangToggleComponent } from '../shared/lang-toggle.component';
import { TPipe } from '../core/t.pipe';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [LangToggleComponent, TPipe, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-lang"><app-lang-toggle></app-lang-toggle></div>
        <h1>{{ 'Request an account' | t }}</h1>
        <p class="muted">{{ 'The admin must approve your request before you can sign in.' | t }}</p>

        @if (done()) {
          <div class="alert success">{{ done() }}</div>
          <a class="btn primary block" routerLink="/login">{{ 'Back to sign in' | t }}</a>
        } @else {
          <div class="field">
            <label for="n">{{ 'Full name' | t }}</label>
            <input id="n" type="text" [(ngModel)]="fullName">
          </div>
          <div class="field">
            <label for="u">{{ 'Username' | t }}</label>
            <input id="u" type="text" autocomplete="username" [(ngModel)]="username">
            <small class="muted">{{ 'At least 3 characters' | t }}</small>
          </div>
          <div class="field">
            <label for="p">{{ 'Password' | t }}</label>
            <input id="p" type="password" autocomplete="new-password" [(ngModel)]="password">
            <small class="muted">{{ 'At least 6 characters' | t }}</small>
          </div>
          <div class="field">
            <label for="c">{{ 'Repeat password' | t }}</label>
            <input id="c" type="password" autocomplete="new-password" [(ngModel)]="confirm" (keyup.enter)="submit()">
          </div>

          @if (error()) { <div class="alert error">{{ error() | t }}</div> }

          <button type="button" class="btn primary block" [disabled]="busy()" (click)="submit()">
            {{ busy() ? 'Sending...' : 'Send request' }}
          </button>
          <p class="muted center">{{ 'Already approved?' | t }} <a routerLink="/login">{{ 'Sign in' | t }}</a></p>
        }
      </div>
    </div>
  `
})
export class RegisterComponent {
  private api = inject(ApiService);

  fullName = '';
  username = '';
  password = '';
  confirm = '';
  readonly error = signal('');
  readonly done = signal('');
  readonly busy = signal(false);

  submit(): void {
    if (!this.fullName.trim()) { this.error.set('Enter your full name.'); return; }
    if (this.username.trim().length < 3) { this.error.set('The username needs at least 3 characters.'); return; }
    if (this.password.length < 6) { this.error.set('The password needs at least 6 characters.'); return; }
    if (this.password !== this.confirm) { this.error.set('The two passwords are not the same.'); return; }

    this.busy.set(true);
    this.error.set('');
    this.api.register(this.fullName.trim(), this.username.trim(), this.password).subscribe({
      next: r => { this.done.set(r.message); this.busy.set(false); },
      error: e => { this.error.set(errMsg(e)); this.busy.set(false); }
    });
  }
}
