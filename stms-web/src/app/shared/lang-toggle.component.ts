import { Component } from '@angular/core';
import { lang, setLang } from '../core/i18n';

// English | አማርኛ switch. The choice is remembered in the browser.
@Component({
  selector: 'app-lang-toggle',
  standalone: true,
  template: `
    <div class="seg lang-toggle" role="group" aria-label="Language">
      <button type="button" class="seg-btn" [class.on]="lang() === 'en'" (click)="set('en')">EN</button>
      <button type="button" class="seg-btn" [class.on]="lang() === 'am'" (click)="set('am')">አማ</button>
    </div>
  `
})
export class LangToggleComponent {
  readonly lang = lang;
  set(l: 'en' | 'am'): void { setLang(l); }
}
