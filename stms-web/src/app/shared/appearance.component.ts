import { Component, inject } from '@angular/core';
import { ACCENTS, FONTS, FontSize, ThemeMode, ThemeService } from '../core/theme.service';
import { TPipe } from '../core/t.pipe';

// Theme, accent colour, font and text size. Used in Settings and on "My account".
@Component({
  selector: 'app-appearance',
  standalone: true,
  imports: [TPipe],
  styles: [`
    .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; background: var(--surface); color: var(--text); padding: 7px 14px; cursor: pointer; font: inherit; }
    .seg button + button { border-left: 1px solid var(--border); }
    .seg button.on { background: var(--primary); color: var(--primary-text); }
    .swatches { display: flex; flex-wrap: wrap; gap: 10px; }
    .sw { width: 34px; height: 34px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; padding: 0; }
    .sw.on { border-color: var(--text); }
    .row { margin-bottom: 16px; }
    .row > label { display: block; font-weight: 600; margin-bottom: 6px; }
    .preview { border: 1px dashed var(--border); border-radius: 8px; padding: 12px; margin: 4px 0 14px; }
    select { padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
  `],
  template: `
    <div class="card">
      <h3>{{ 'Appearance' | t }}</h3>
      <p class="muted">{{ 'Saved for your account and used on every device.' | t }}</p>

      <div class="row">
        <label>{{ 'Theme' | t }}</label>
        <div class="seg">
          @for (m of modes; track m.id) {
            <button type="button" [class.on]="theme.prefs().mode === m.id" (click)="theme.set({ mode: m.id })">{{ m.name | t }}</button>
          }
        </div>
      </div>

      <div class="row">
        <label>{{ 'Accent color' | t }}</label>
        <div class="swatches">
          @for (a of accents; track a.id) {
            <button type="button" class="sw" [class.on]="theme.prefs().accent === a.id"
                    [style.background]="theme.isDark() ? a.dark : a.light" [title]="a.name | t" [attr.aria-label]="a.name"
                    (click)="theme.set({ accent: a.id })"></button>
          }
        </div>
      </div>

      <div class="row">
        <label>{{ 'Font' | t }}</label>
        <select [value]="theme.prefs().font" (change)="theme.set({ font: $any($event.target).value })">
          @for (f of fonts; track f.id) { <option [value]="f.id" [selected]="theme.prefs().font === f.id">{{ f.name | t }}</option> }
        </select>
        @if (theme.fontFailed()) {
          <small class="muted"><br>{{ 'The online font could not be loaded, so a built-in font is used instead.' | t }}</small>
        }
      </div>

      <div class="row">
        <label>{{ 'Text size' | t }}</label>
        <div class="seg">
          @for (s of sizes; track s.id) {
            <button type="button" [class.on]="theme.prefs().size === s.id" (click)="theme.set({ size: s.id })">{{ s.name | t }}</button>
          }
        </div>
      </div>

      <div class="preview">
        <strong>Aa Bb Cc 1,234,567.50 ETB</strong><br>
        <span class="muted">ሰላም ዓለም, The quick brown fox jumps over the lazy dog.</span>
      </div>

      <button type="button" class="btn ghost" (click)="theme.reset()">{{ 'Reset to default' | t }}</button>
    </div>
  `
})
export class AppearanceComponent {
  readonly theme = inject(ThemeService);
  readonly accents = ACCENTS;
  readonly fonts = FONTS;
  readonly modes: { id: ThemeMode; name: string }[] = [
    { id: 'system', name: 'System' }, { id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }
  ];
  readonly sizes: { id: FontSize; name: string }[] = [
    { id: 'small', name: 'Small' }, { id: 'normal', name: 'Normal' }, { id: 'large', name: 'Large' }, { id: 'xlarge', name: 'Extra large' }
  ];
}