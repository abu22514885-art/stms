import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { PaymentMethod, Provider } from '../core/models';
import { errMsg } from '../core/util';
import { TPipe } from '../core/t.pipe';

// Admin settings: company details on receipts, and the banks / wallets people can pay with.
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [TPipe, FormsModule],
  template: `
    <div class="page-head"><h2>{{ 'Settings' | t }}</h2></div>

    @if (error()) { <div class="alert error">{{ error() | t }}</div> }
    @if (message()) { <div class="alert success">{{ message() | t }}</div> }

    <div class="card">
      <h3>{{ 'Company details' | t }}</h3>
      <p class="muted">{{ 'Shown on receipts and reports. VAT rate: {n}%.' | t:{ n: vat() } }}</p>
      <div class="field"><label>{{ 'Company name' | t }}</label><input type="text" [(ngModel)]="company.companyName"></div>
      <div class="field"><label>{{ 'Address' | t }}</label><input type="text" [(ngModel)]="company.address"></div>
      <div class="field"><label>{{ 'Phone' | t }}</label><input type="text" [(ngModel)]="company.phone"></div>
      <div class="field"><label>{{ 'TIN' | t }}</label><input type="text" [(ngModel)]="company.tin"></div>
      <button type="button" class="btn primary" [disabled]="busy()" (click)="saveCompany()">{{ 'Save' | t }}</button>
    </div>

    @for (m of eMethods(); track m.id) {
      <div class="card">
        <h3>{{ m.name | t }}: {{ 'banks / wallets' | t }}</h3>
        <div class="table-wrap">
          <table>
            <tbody>
              @for (p of m.providers; track p.id) {
                <tr>
                  <td>
                    @if (editingId() === p.id) {
                      <input type="text" [(ngModel)]="editName">
                    } @else {
                      {{ p.name }}
                    }
                  </td>
                  <td><span class="badge" [class.ok]="p.isActive" [class.muted]="!p.isActive">{{ p.isActive ? 'Active' : 'Off' }}</span></td>
                  <td class="num nowrap">
                    @if (editingId() === p.id) {
                      <button type="button" class="btn small primary" [disabled]="busy()" (click)="saveName(m, p)">{{ 'Save' | t }}</button>
                      <button type="button" class="btn small ghost" (click)="editingId.set(null)">{{ 'Cancel' | t }}</button>
                    } @else {
                      <button type="button" class="btn small" (click)="startEdit(p)">{{ 'Rename' | t }}</button>
                      <button type="button" class="btn small" [disabled]="busy()" (click)="setActive(m, p, !p.isActive)">{{ p.isActive ? 'Turn off' : 'Turn on' }}</button>
                      <button type="button" class="btn small danger" [disabled]="busy()" (click)="remove(p)">{{ 'Delete' | t }}</button>
                    }
                  </td>
                </tr>
              }
              @if (m.providers.length === 0) { <tr><td class="muted">{{ 'None yet.' | t }}</td></tr> }
            </tbody>
          </table>
        </div>
        <div class="toolbar">
          <input type="text" [placeholder]="'Add a name, e.g. a bank or wallet' | t" [ngModel]="newNames[m.id] ?? ''" (ngModelChange)="newNames[m.id] = $event" (keyup.enter)="add(m)">
          <button type="button" class="btn primary" [disabled]="busy()" (click)="add(m)">{{ 'Add' | t }}</button>
        </div>
      </div>
    }
  `
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);

  readonly methods = signal<PaymentMethod[]>([]);
  readonly vat = signal(15);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly editingId = signal<number | null>(null);

  company = { companyName: '', address: '', phone: '', tin: '' };
  newNames: Record<number, string> = {};
  editName = '';

  eMethods(): PaymentMethod[] { return this.methods().filter(m => m.type !== 'Cash'); }

  ngOnInit(): void {
    this.api.company().subscribe({
      next: s => {
        this.company = {
          companyName: s.company.name ?? '', address: s.company.address ?? '',
          phone: s.company.phone ?? '', tin: s.company.tin ?? ''
        };
        this.vat.set(s.vatRatePercent);
      },
      error: e => this.error.set(errMsg(e))
    });
    this.loadMethods();
  }

  private loadMethods(): void {
    this.api.paymentMethods().subscribe({ next: m => this.methods.set(m), error: e => this.error.set(errMsg(e)) });
  }

  saveCompany(): void {
    this.run(this.api.saveCompany(this.company), 'Company details saved.');
  }

  add(m: PaymentMethod): void {
    const name = (this.newNames[m.id] ?? '').trim();
    if (!name) return;
    this.run(this.api.addProvider(m.id, name), `${name} added.`, () => { this.newNames[m.id] = ''; });
  }

  startEdit(p: Provider): void { this.editName = p.name; this.editingId.set(p.id); }

  saveName(m: PaymentMethod, p: Provider): void {
    const name = this.editName.trim();
    if (!name) return;
    this.run(this.api.updateProvider(p.id, m.id, name, p.isActive), 'Saved.', () => this.editingId.set(null));
  }

  setActive(m: PaymentMethod, p: Provider, active: boolean): void {
    this.run(this.api.updateProvider(p.id, m.id, p.name, active), 'Saved.');
  }

  remove(p: Provider): void {
    if (!confirm(`Delete ${p.name}? If it was used in past payments, turn it off instead.`)) return;
    this.run(this.api.deleteProvider(p.id), 'Deleted.');
  }

  private run(call: ReturnType<ApiService['deleteProvider']>, ok: string, after?: () => void): void {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    call.subscribe({
      next: () => { this.busy.set(false); this.message.set(ok); after?.(); this.loadMethods(); },
      error: e => { this.busy.set(false); this.error.set(errMsg(e)); }
    });
  }
}
