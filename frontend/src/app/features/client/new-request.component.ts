import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-new-request',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="mb-6">
      <h1 class="text-xl font-bold tracking-tight text-ink-900">New request</h1>
      <p class="text-sm text-ink-500">Tell us what you need. A time estimate helps us plan, but it's optional.</p>
    </div>

    <div class="card max-w-2xl p-6">
      <div class="space-y-5">
        <div>
          <label class="label" for="title">What do you need done?</label>
          <input id="title" class="input" [(ngModel)]="title" placeholder="e.g. Redesign the landing page hero" />
        </div>
        <div>
          <label class="label" for="desc">Details (optional)</label>
          <textarea id="desc" class="input min-h-[120px]" [(ngModel)]="description"
                    placeholder="Add any context, links, or requirements…"></textarea>
        </div>
        <div>
          <label class="label" for="est">Estimated time in minutes (optional)</label>
          <input id="est" type="number" min="0" class="input max-w-[200px]" [(ngModel)]="estimate" placeholder="e.g. 120" />
          <p class="mt-1 text-xs text-ink-400">Leave blank if you're not sure.</p>
        </div>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button class="btn-outline" (click)="reset()">Clear</button>
        <button class="btn-primary" (click)="submit()" [disabled]="!title.trim() || saving()">
          {{ saving() ? 'Submitting…' : 'Submit request' }}
        </button>
      </div>
    </div>
  `,
})
export class NewRequestComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  title = '';
  description = '';
  estimate: number | null = null;
  saving = signal(false);

  submit(): void {
    if (!this.title.trim()) return;
    this.saving.set(true);
    this.api
      .createTask({
        title: this.title.trim(),
        description: this.description.trim() || null,
        estimated_minutes: this.estimate ? Number(this.estimate) : null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('Request submitted 🎉');
          this.router.navigate(['/portal/tasks']);
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(e?.error?.detail ?? 'Could not submit request');
        },
      });
  }

  reset(): void {
    this.title = '';
    this.description = '';
    this.estimate = null;
  }
}
