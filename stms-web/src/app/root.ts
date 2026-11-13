import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { lang } from './core/i18n';
import { SplashComponent } from './shared/Splash.component';

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
  constructor() { document.documentElement.lang = lang(); }
}