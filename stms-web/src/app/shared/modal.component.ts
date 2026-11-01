import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TPipe } from '../core/t.pipe';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [TPipe],
  template: `
    <div class="backdrop" (click)="closed.emit()">
      <div class="modal" [style.max-width.px]="width" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>{{ title | t }}</h3>
          <button type="button" class="icon-btn" (click)="closed.emit()" [aria-label]="'Close' | t">&#10005;</button>
        </div>
        <div class="modal-body">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `
})
export class ModalComponent {
  @Input() title = '';
  @Input() width = 560;
  @Output() closed = new EventEmitter<void>();
}
