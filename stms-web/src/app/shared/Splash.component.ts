import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { TPipe } from '../core/t.pipe';

// Cinematic intro: a salesperson sells a product, the customer pays, the sale completes.
// Pure SVG + CSS (no video, no libraries). Click, Skip or Esc ends it. Plays once per browser session.
const KEY = 'stms_splash_seen';

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [TPipe],
  template: `
    <div class="splash" [class.leaving]="leaving()" role="dialog" aria-label="Stock Manager" (click)="finish()">
      <div class="stage">
        <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="sp-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#0c241c"/><stop offset="1" stop-color="#16392d"/>
            </linearGradient>
            <pattern id="sp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#d9f27a" stroke-opacity=".07"/>
            </pattern>
            <linearGradient id="sp-sweep" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/>
              <stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
          </defs>
          <rect width="800" height="450" fill="url(#sp-bg)"/>
          <rect width="800" height="450" fill="url(#sp-grid)"/>
          <rect class="sweep" x="-260" y="0" width="260" height="450" fill="url(#sp-sweep)"/>

          <!-- counter -->
          <rect x="120" y="318" width="560" height="14" rx="5" fill="#d9f27a" opacity=".85"/>
          <rect x="140" y="332" width="520" height="70" fill="#0a1c16"/>

          <!-- salesperson (left) -->
          <g class="actor a1">
            <circle cx="215" cy="214" r="26" fill="#f0c9a0"/>
            <path d="M189 206q26-30 52 0q-6-16-26-16t-26 16z" fill="#2b1d14"/>
            <rect x="183" y="242" width="64" height="76" rx="18" fill="#d9f27a"/>
            <rect x="200" y="256" width="30" height="10" rx="5" fill="#0c241c" opacity=".35"/>
          </g>
          <!-- customer (right) -->
          <g class="actor a2">
            <circle cx="585" cy="214" r="26" fill="#c98f66"/>
            <path d="M559 210q26-34 52 0q-8-10-26-10t-26 10z" fill="#140c08"/>
            <rect x="553" y="242" width="64" height="76" rx="18" fill="#f08a5d"/>
          </g>

          <!-- product box: appears, then slides to the customer -->
          <g class="box">
            <rect x="0" y="0" width="46" height="40" rx="5" fill="#e9d7a8"/>
            <rect x="0" y="0" width="46" height="12" rx="5" fill="#cdb67a"/>
            <rect x="19" y="0" width="8" height="40" fill="#b04a3a" opacity=".85"/>
          </g>

          <!-- payment: notes slide back to the salesperson -->
          <g class="cash">
            <rect x="0" y="0" width="56" height="28" rx="4" fill="#58b87c"/>
            <circle cx="28" cy="14" r="8" fill="none" stroke="#e8fff0" stroke-width="2"/>
            <text x="28" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="#e8fff0">Br</text>
          </g>

          <!-- sale complete -->
          <g class="done" transform="translate(400 150)">
            <circle class="d-ring" r="46" fill="none" stroke="#d9f27a" stroke-width="6"/>
            <path class="d-tick" d="M-20 2 L-6 16 L22 -14" fill="none" stroke="#d9f27a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
            <circle class="spark s1" cx="-70" cy="-30" r="4" fill="#d9f27a"/>
            <circle class="spark s2" cx="72" cy="-24" r="3" fill="#fff"/>
            <circle class="spark s3" cx="-58" cy="46" r="3" fill="#fff"/>
            <circle class="spark s4" cx="66" cy="44" r="4" fill="#d9f27a"/>
          </g>
        </svg>
        <div class="vignette"></div>
      </div>

      <div class="wordmark">{{ 'Stock Manager' | t }}</div>
      <div class="bar top"></div>
      <div class="bar bottom"><p class="cap" [class.on]="true">{{ caption() | t }}</p></div>
      <button type="button" class="skip" (click)="finish(); $event.stopPropagation()">{{ 'Skip' | t }} &rsaquo;</button>
    </div>
  `,
  styles: [`
    .splash { position: fixed; inset: 0; z-index: 1000; background: #0c241c; overflow: hidden; cursor: pointer; transition: opacity .5s; font-family: inherit; }
    .splash.leaving { opacity: 0; }
    .stage { position: absolute; inset: 0; }
    .stage svg { width: 100%; height: 100%; animation: push 7.6s ease-out forwards; transform-origin: 50% 60%; }
    .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.55) 100%); pointer-events: none; }
    .bar { position: absolute; left: 0; right: 0; height: 0; background: #000; animation: bar 1s .1s ease-out forwards; }
    .bar.top { top: 0; } .bar.bottom { bottom: 0; display: flex; align-items: center; justify-content: center; }
    .cap { margin: 0; color: #f3f7ea; font-size: clamp(14px, 2.2vw, 22px); letter-spacing: .04em; opacity: 0; animation: fadein .4s .6s forwards; text-align: center; padding: 0 16px; }
    .wordmark { position: absolute; top: 16%; left: 0; right: 0; text-align: center; color: #d9f27a; font-weight: 700;
      font-size: clamp(26px, 6vw, 56px); letter-spacing: .12em; text-transform: uppercase; opacity: 0; animation: title 1.6s .5s ease-out forwards; }
    .skip { position: absolute; right: 16px; bottom: 14px; z-index: 2; background: transparent; color: #cfd8c8; border: 1px solid rgba(255,255,255,.3);
      border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; }
    .skip:hover { background: rgba(255,255,255,.12); }

    .sweep { animation: sweep 1.6s .3s ease-in-out forwards; }
    .actor { opacity: 0; animation: rise .7s ease-out forwards; }
    .a1 { animation-delay: 1.4s; } .a2 { animation-delay: 1.7s; }
    .box { transform: translate(250px, 280px); opacity: 0; animation: boxin .5s 2.2s forwards, boxgo 1.4s 3s ease-in-out forwards; }
    .cash { transform: translate(500px, 290px); opacity: 0; animation: cashin .4s 4.5s forwards, cashgo 1.2s 4.9s ease-in-out forwards; }
    .done { opacity: 0; animation: fadein .3s 6.1s forwards; }
    .d-ring { stroke-dasharray: 290; stroke-dashoffset: 290; animation: draw .6s 6.1s ease-out forwards; }
    .d-tick { stroke-dasharray: 80; stroke-dashoffset: 80; animation: draw .4s 6.6s ease-out forwards; }
    .spark { opacity: 0; animation: spark .9s 6.8s ease-out forwards; }
    .s2 { animation-delay: 6.9s; } .s3 { animation-delay: 7s; } .s4 { animation-delay: 7.05s; }

    @keyframes push { to { transform: scale(1.08); } }
    @keyframes bar { to { height: 11vh; } }
    @keyframes fadein { to { opacity: 1; } }
    @keyframes title { 0% { opacity: 0; letter-spacing: .4em; } 40% { opacity: 1; } 100% { opacity: 0; letter-spacing: .12em; } }
    @keyframes sweep { to { transform: translateX(1100px); } }
    @keyframes rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
    @keyframes boxin { to { opacity: 1; } }
    @keyframes boxgo { from { transform: translate(250px, 280px); opacity: 1; } to { transform: translate(500px, 280px); opacity: 1; } }
    @keyframes cashin { to { opacity: 1; } }
    @keyframes cashgo { from { transform: translate(500px, 290px); opacity: 1; } to { transform: translate(262px, 290px); opacity: 1; } }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes spark { 0% { opacity: 0; transform: scale(.2); } 40% { opacity: 1; } 100% { opacity: 0; transform: scale(1.6) translateY(-10px); } }
    @media (prefers-reduced-motion: reduce) {
      .stage svg, .sweep, .box, .cash, .actor, .done, .d-ring, .d-tick, .spark, .wordmark { animation: none !important; opacity: 1; stroke-dashoffset: 0; }
      .box { transform: translate(500px, 280px); } .cash { opacity: 0; } .spark { opacity: 0; } .wordmark { opacity: 1; }
    }
  `]
})
export class SplashComponent implements OnInit, OnDestroy {
  @Output() done = new EventEmitter<void>();

  readonly caption = signal('Stock Manager');
  readonly leaving = signal(false);
  private timers: any[] = [];
  private ended = false;

  /** True when the intro has not been seen in this browser session yet. */
  static shouldPlay(): boolean {
    try { return sessionStorage.getItem(KEY) !== '1'; } catch { return true; }
  }

  ngOnInit(): void {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { this.caption.set('Sale complete'); this.at(1800, () => this.finish()); return; }
    this.at(1500, () => this.caption.set('A customer picks a product'));
    this.at(3000, () => this.caption.set('The sale is made'));
    this.at(4600, () => this.caption.set('Payment received'));
    this.at(6100, () => this.caption.set('Sale complete'));
    this.at(7700, () => this.finish());
  }

  @HostListener('document:keydown.escape') onEsc(): void { this.finish(); }

  finish(): void {
    if (this.ended) return;
    this.ended = true;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode: it just plays again next time */ }
    this.leaving.set(true);
    this.timers.push(setTimeout(() => this.done.emit(), 500));
  }

  private at(ms: number, fn: () => void): void { this.timers.push(setTimeout(fn, ms)); }
  ngOnDestroy(): void { this.timers.forEach(clearTimeout); }
}