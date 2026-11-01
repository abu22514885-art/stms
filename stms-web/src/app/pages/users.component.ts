import { Component, OnInit, inject, signal } from '@angular/core';

import { ApiService } from '../core/api.service';
import { PasswordResetRequestItem, User } from '../core/models';
import { errMsg } from '../core/util';
import { PagerComponent } from '../shared/pager.component';
import { TPipe } from '../core/t.pipe';
import { FdatePipe } from '../core/fdate.pipe';

// Admin: approve or reject new salesperson accounts, and switch accounts on or off.
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [TPipe, FdatePipe, PagerComponent],
  template: `
    <div class="page-head"><h2>{{ 'Users' | t }}</h2></div>

    @if (error()) { <div class="alert error">{{ error() | t }}</div> }
    @if (loading()) { <p class="muted">{{ 'Loading...' | t }}</p> }

    <div class="card">
      <h3>{{ 'Password reset requests ({n})' | t:{ n: resetRequests().length } }}</h3>
      @if (resetRequests().length === 0) { <p class="muted">{{ 'No password reset requests.' | t }}</p> }
      @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ 'Name' | t }}</th><th>{{ 'Username' | t }}</th><th>{{ 'Requested' | t }}</th><th></th></tr></thead>
            <tbody>
              @for (request of resetRequests(); track request.id) {
                <tr>
                  <td>{{ request.fullName }}</td>
                  <td>{{ request.username }}</td>
                  <td>{{ request.requestedAt | fdate:'datetime' }}</td>
                  <td class="num nowrap">
                    <button type="button" class="btn small primary" [disabled]="busy()" (click)="approvePasswordReset(request)">{{ 'Approve reset' | t }}</button>
                    <button type="button" class="btn small danger" [disabled]="busy()" (click)="rejectPasswordReset(request)">{{ 'Reject' | t }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <div class="card">
      <h3>{{ 'Waiting for approval ({n})' | t:{ n: pending().length } }}</h3>
      @if (pending().length === 0) { <p class="muted">{{ 'No requests.' | t }}</p> }
      <div class="table-wrap">
        <table>
          <tbody>
            @for (u of pending(); track u.id) {
              <tr>
                <td>{{ u.fullName }}<br><small class="muted">{{ u.username }}, {{ 'requested' | t }} {{ u.createdAt | fdate:'datetime' }}</small></td>
                <td class="num nowrap">
                  <button type="button" class="btn small primary" [disabled]="busy()" (click)="approve(u)">{{ 'Approve' | t }}</button>
                  <button type="button" class="btn small danger" [disabled]="busy()" (click)="reject(u)">{{ 'Reject' | t }}</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>{{ 'All accounts' | t }}</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>{{ 'Name' | t }}</th><th>{{ 'Username' | t }}</th><th>{{ 'Role' | t }}</th><th>{{ 'Approval' | t }}</th><th>{{ 'Active' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (u of all(); track u.id) {
              <tr>
                <td>{{ u.fullName }}</td>
                <td>{{ u.username }}</td>
                <td>{{ u.role | t }}</td>
                <td><span class="badge" [class.ok]="u.approvalStatus === 'Approved'" [class.warn]="u.approvalStatus === 'Rejected'">{{ u.approvalStatus | t }}</span></td>
                <td>{{ u.isActive ? 'Yes' : 'No' }}</td>
                <td class="num nowrap">
                  @if (u.approvalStatus === 'Approved' && u.role !== 'Admin') {
                    <button type="button" class="btn small" [disabled]="busy()" (click)="toggle(u)">{{ u.isActive ? 'Disable' : 'Enable' }}</button>
                  }
                  @if (u.approvalStatus === 'Rejected') {
                    <button type="button" class="btn small" [disabled]="busy()" (click)="approve(u)">{{ 'Approve' | t }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-pager [page]="page()" [pageSize]="pageSize" [total]="total()" (pageChange)="goTo($event)"></app-pager>
    </div>
  `
})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);

  readonly all = signal<User[]>([]);
  readonly pendingList = signal<User[]>([]);
  readonly resetRequests = signal<PasswordResetRequestItem[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 20;
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  pending(): User[] { return this.pendingList(); }

  goTo(p: number): void { this.page.set(p); this.load(); }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.passwordResetRequests().subscribe({
      next: requests => this.resetRequests.set(requests),
      error: e => this.error.set(errMsg(e))
    });
    // Waiting requests are few, so they come in one go. All accounts are paged.
    this.api.users('Pending', 1, 100).subscribe({
      next: r => this.pendingList.set(r.items),
      error: e => this.error.set(errMsg(e))
    });
    this.api.users(undefined, this.page(), this.pageSize).subscribe({
      next: r => { this.all.set(r.items); this.total.set(r.total); this.loading.set(false); },
      error: e => { this.error.set(errMsg(e)); this.loading.set(false); }
    });
  }

  approve(u: User): void { this.run(this.api.approveUser(u.id)); }
  approvePasswordReset(request: PasswordResetRequestItem): void {
    this.run(this.api.approvePasswordReset(request.id));
  }
  rejectPasswordReset(request: PasswordResetRequestItem): void {
    if (confirm(`Reject the password reset request for ${request.fullName}?`))
      this.run(this.api.rejectPasswordReset(request.id));
  }
  reject(u: User): void {
    if (confirm(`Reject ${u.fullName}?`)) this.run(this.api.rejectUser(u.id));
  }
  toggle(u: User): void { this.run(this.api.toggleUser(u.id)); }

  private run(call: ReturnType<ApiService['approveUser']>): void {
    this.busy.set(true);
    this.error.set('');
    call.subscribe({
      next: () => { this.busy.set(false); this.load(); },
      error: e => { this.busy.set(false); this.error.set(errMsg(e)); }
    });
  }
}
