import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { lang } from './core/i18n';
import { SplashComponent } from './shared/Splash.component';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SplashComponent],
  template: `
    <router-outlet></router-outlet>
    @if (showSplash()) { <app-splash (done)="showSplash.set(false)"></app-splash> }
  `
})
export class RootComponent {
  // The intro plays once per browser session
  readonly showSplash = signal(SplashComponent.shouldPlay());
  constructor() {
    document.documentElement.lang = lang();
    inject(ThemeService);          // applies the saved theme, accent colour and font straight away
  }
}