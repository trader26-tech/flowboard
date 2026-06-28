import { Component, inject } from '@angular/core';

import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  standalone: true,
  template: `
    <div class="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex animate-fade-in items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-float"
          [class]="styles(t.kind)"
        >
          <span class="mt-0.5 text-base leading-none">{{ icon(t.kind) }}</span>
          <span class="flex-1 font-medium">{{ t.message }}</span>
          <button class="text-ink-400 hover:text-ink-700" (click)="toast.dismiss(t.id)">✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastComponent {
  toast = inject(ToastService);

  styles(kind: string): string {
    switch (kind) {
      case 'success': return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'error': return 'border-rose-200 bg-rose-50 text-rose-800';
      default: return 'border-ink-200 bg-white text-ink-800';
    }
  }
  icon(kind: string): string {
    switch (kind) {
      case 'success': return '✓';
      case 'error': return '⚠';
      default: return 'ℹ';
    }
  }
}
