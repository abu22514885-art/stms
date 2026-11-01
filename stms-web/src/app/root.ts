import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { lang } from './core/i18n';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`
})
export class RootComponent {
  constructor() { document.documentElement.lang = lang(); }
}
