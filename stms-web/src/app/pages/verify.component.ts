import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { API_URL } from '../core/config';
import { TPipe } from '../core/t.pipe';
import { LangToggleComponent } from '../shared/lang-toggle.component';

interface VerifyResult {
  valid: boolean;
  company?: string; tin?: string | null; invoiceNo?: string; date?: string;
  subtotal?: number; vat?: number; total?: number; hasVat?: boolean;
  items?: { name: string; quantity: number; lineTotal: number }[];
}

// Public page opened by the QR code on an invoice. No login.
// Checking animation, then a green "genuine" result with the items, or a red "invalid / fake" result.
@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [TPipe, DecimalPipe, LangToggleComponent],
  template: `
    <main class="vf" [class.ok]="phase() === 'ok'" [class.bad]="phase() === 'bad'">
      <div class="vf-lang"><app-lang-toggle></app-lang-toggle></div>

      <section class="vf-card" aria-live="polite">
        @switch (phase()) {
          @case ('checking') {
            <div class="doc" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="scan"></span></div>
            <h1>{{ 'Checking this invoice...' | t }}</h1>
            <p class="sub">{{ 'Comparing it with our records' | t }}</p>
          }
          @case ('ok') {
            <div class="badge good" aria-hidden="true">
              <span class="pulse"></span><span class="pulse p2"></span>
              <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54"/><path d="M34 62 L52 80 L88 40"/></svg>
            </div>
            <h1>{{ 'Genuine invoice' | t }}</h1>
            <p class="sub">{{ 'This invoice was issued by the company below.' | t }}</p>

            @if (res(); as r) {
              <div class="info">
                <strong>{{ r.company }}</strong>
                @if (r.tin) { <span>TIN: {{ r.tin }}</span> }
                <span>{{ r.invoiceNo }} &middot; {{ r.date }}</span>
              </div>
              <table class="items">
                <thead><tr><th>{{ 'Items' | t }}</th><th class="r">{{ 'Qty' | t }}</th><th class="r">{{ 'Total' | t }}</th></tr></thead>
                <tbody>
                  @for (i of r.items ?? []; track $index) {
                    <tr><td>{{ i.name }}</td><td class="r">{{ i.quantity }}</td><td class="r">{{ i.lineTotal | number:'1.2-2' }}</td></tr>
                  }
                </tbody>
              </table>
              <div class="tot">
                <div><span>{{ 'Subtotal' | t }}</span><span>{{ r.subtotal | number:'1.2-2' }}</span></div>
                @if (r.hasVat) { <div><span>{{ 'VAT' | t }}</span><span>{{ r.vat | number:'1.2-2' }}</span></div> }
                <div class="g"><span>{{ 'Total' | t }}</span><span>{{ r.total | number:'1.2-2' }}</span></div>
              </div>
              <p class="hint">{{ 'Check that these items and amounts match your paper receipt.' | t }}</p>
            }
          }
          @case ('bad') {
            <div class="badge fail" aria-hidden="true">
              <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54"/><path d="M40 40 L80 80 M80 40 L40 80"/></svg>
            </div>
            <h1>{{ 'Invalid or fake invoice' | t }}</h1>
            <p class="sub">{{ 'This code does not match any invoice issued by this system. Do not trust this receipt.' | t }}</p>
          }
          @case ('error') {
            <div class="badge warn" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54"/><path d="M60 34 V68 M60 84 V86"/></svg></div>
            <h1>{{ 'Could not check right now' | t }}</h1>
            <p class="sub">{{ 'Check your internet connection and try again. The server may be waking up.' | t }}</p>
            <button type="button" class="btn primary" (click)="run()">{{ 'Try again' | t }}</button>
          }
        }
      </section>
    </main>
  `,
  styles: [`
    .vf { min-height: 100vh; display: grid; place-items: center; padding: 20px 16px; background: #0f2a22; color: #1c2430; transition: background .5s; }
    .vf.ok { background: #0f3a2a; } .vf.bad { background: #3a1417; }
    .vf-lang { position: fixed; top: 12px; right: 12px; }
    .vf-card { width: 100%; max-width: 420px; background: #fff; border-radius: 18px; padding: 26px 20px 22px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.4); animation: rise .4s ease-out; }
    h1 { margin: 14px 0 4px; font-size: 22px; } .sub { margin: 0 0 12px; color: #5d6877; font-size: 14px; }
    .ok h1 { color: #14804a; } .bad h1 { color: #c0262d; }

    .doc { position: relative; width: 92px; height: 116px; margin: 4px auto 0; border: 3px solid #2b6b57; border-radius: 10px; padding: 16px 12px; overflow: hidden; background: #f4faf7; }
    .doc i { display: block; height: 6px; border-radius: 3px; background: #b9d8cc; margin-bottom: 10px; } .doc i:nth-child(2) { width: 70%; } .doc i:nth-child(3) { width: 85%; } .doc i:nth-child(4) { width: 55%; }
    .scan { position: absolute; left: 0; right: 0; height: 4px; background: #2ecc8a; box-shadow: 0 0 14px 4px rgba(46,204,138,.7); animation: scan 1.1s ease-in-out infinite alternate; }

    .badge { position: relative; width: 120px; height: 120px; margin: 0 auto; }
    .badge svg { width: 120px; height: 120px; position: relative; z-index: 1; }
    .badge circle { fill: none; stroke-width: 7; stroke-dasharray: 340; stroke-dashoffset: 340; animation: draw .6s ease-out forwards; }
    .badge path { fill: none; stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 110; stroke-dashoffset: 110; animation: draw .4s .5s ease-out forwards; }
    .good circle, .good path { stroke: #1f9d55; } .fail circle, .fail path { stroke: #d1343b; } .warn circle, .warn path { stroke: #d99a1e; }
    .good svg { animation: pop .5s .9s ease-out; } .fail { animation: shake .5s .9s; }
    .pulse { position: absolute; inset: 6px; border-radius: 50%; background: rgba(31,157,85,.25); animation: ring 1.6s .8s ease-out infinite; } .p2 { animation-delay: 1.4s; }

    .info { display: flex; flex-direction: column; gap: 2px; margin: 8px 0 10px; font-size: 13px; color: #5d6877; } .info strong { color: #1c2430; font-size: 16px; }
    .items { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
    .items th, .items td { padding: 6px 4px; border-bottom: 1px solid #e3e7ec; } .r { text-align: right !important; }
    .tot { margin-top: 8px; font-size: 14px; } .tot > div { display: flex; justify-content: space-between; padding: 2px 0; }
    .tot .g { font-weight: 700; font-size: 17px; border-top: 1px solid #e3e7ec; margin-top: 4px; padding-top: 6px; }
    .hint { margin: 12px 0 0; font-size: 12px; color: #5d6877; }

    @keyframes scan { from { top: 6px; } to { top: 104px; } }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.12); } 100% { transform: scale(1); } }
    @keyframes ring { from { transform: scale(.8); opacity: .8; } to { transform: scale(1.5); opacity: 0; } }
    @keyframes shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-9px); } 40% { transform: translateX(9px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
    @keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .scan, .pulse, .fail, .good svg, .vf-card { animation: none; } }
  `]
})
export class VerifyComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  readonly phase = signal<'checking' | 'ok' | 'bad' | 'error'>('checking');
  readonly res = signal<VerifyResult | null>(null);
  private timer: any;

  ngOnInit(): void { this.run(); }

  run(): void {
    this.phase.set('checking');
    const invoice = this.route.snapshot.paramMap.get('invoice') ?? '';
    const sig = this.route.snapshot.queryParamMap.get('s') ?? '';
    const started = Date.now();
    // Always show the checking animation for at least 1.6 seconds, so the result feels deliberate
    const show = (p: 'ok' | 'bad' | 'error', r: VerifyResult | null) => {
      this.timer = setTimeout(() => { this.res.set(r); this.phase.set(p); }, Math.max(0, 1600 - (Date.now() - started)));
    };

    if (!invoice || !sig) { show('bad', null); return; }

    this.http.get<VerifyResult>(`${API_URL}/api/verify/${encodeURIComponent(invoice)}`, { params: { s: sig } }).subscribe({
      next: r => r.valid ? show('ok', r) : show('bad', null),
      error: () => show('error', null)
    });
  }

  ngOnDestroy(): void { clearTimeout(this.timer); }
}