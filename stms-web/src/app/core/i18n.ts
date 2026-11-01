import { signal } from '@angular/core';
import { AM } from './am';

export type Lang = 'en' | 'am';

function load(): Lang {
  try { return localStorage.getItem('stms.lang') === 'am' ? 'am' : 'en'; } catch { return 'en'; }
}

// The chosen language. Anything that reads lang() on screen updates when it changes.
export const lang = signal<Lang>(load());

export function setLang(l: Lang): void {
  lang.set(l);
  try { localStorage.setItem('stms.lang', l); } catch { /* private window: ignore */ }
  document.documentElement.lang = l;
}

// English text is the key. If there is no Amharic for it, the English shows. {name} gets replaced by params.
export function tr(en: string, params?: Record<string, string | number>): string {
  let s = lang() === 'am' ? (AM[en] ?? en) : en;
  if (params) for (const k of Object.keys(params)) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}
