import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ClientStats, Task } from '../../core/models';
import { formatMinutes } from '../../core/time.util';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-ink-900">Hi {{ name() }} 👋</h1>
        <p class="text-sm text-ink-500">Here's how your work is progressing.</p>
      </div>
      <a routerLink="/portal/new" class="btn-primary">＋ New request</a>
    </div>

    @if (stats(); as s) {
      <!-- Progress hero -->
      <div class="card mb-6 p-6">
        <div class="flex flex-col items-center gap-6 sm:flex-row">
          <div class="relative grid h-32 w-32 shrink-0 place-items-center">
            <svg viewBox="0 0 36 36" class="h-32 w-32 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" stroke-width="3.2" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#0f172a" stroke-width="3.2"
                      stroke-linecap="round" [attr.stroke-dasharray]="dash(s.completion_rate)" />
            </svg>
            <div class="absolute text-center">
              <p class="text-2xl font-extrabold text-ink-900">{{ s.completion_rate }}%</p>
              <p class="text-xs text-ink-400">complete</p>
            </div>
          </div>
          <div class="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
            <div><p class="text-2xl font-bold text-ink-900">{{ s.total_tasks }}</p><p class="text-xs text-ink-400">Total</p></div>
            <div><p class="text-2xl font-bold text-emerald-600">{{ s.completed_tasks }}</p><p class="text-xs text-ink-400">Completed</p></div>
            <div><p class="text-2xl font-bold text-ink-800">{{ s.in_progress_tasks }}</p><p class="text-xs text-ink-400">In progress</p></div>
            <div><p class="text-2xl font-bold text-amber-600">{{ s.pending_tasks }}</p><p class="text-xs text-ink-400">Pending</p></div>
          </div>
        </div>
      </div>
    }

    <!-- Recently completed -->
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Recently completed</h2>
    @if (!completed().length) {
      <div class="card grid place-items-center py-12 text-center text-ink-400">
        <span class="text-3xl">⌛</span>
        <p class="mt-2 text-sm">Nothing completed yet — your delivered work will show here.</p>
      </div>
    } @else {
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (t of completed(); track t.id) {
          <div class="card overflow-hidden">
            @if (t.proof_image_url) {
              <a [href]="t.proof_image_url" target="_blank" rel="noopener">
                <img [src]="t.proof_image_url" class="h-36 w-full object-cover" alt="proof" />
              </a>
            }
            <div class="p-4">
              <span class="chip bg-emerald-50 text-emerald-700">✓ Completed</span>
              <h3 class="mt-2 font-semibold text-ink-900">{{ t.title }}</h3>
              @if (t.completion_note) { <p class="mt-1 text-sm text-ink-500">{{ t.completion_note }}</p> }
              <p class="mt-2 text-xs text-ink-400">Time spent {{ fmt(Math.round(t.accumulated_seconds / 60)) }}</p>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class ClientDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  stats = signal<ClientStats | null>(null);
  completed = signal<Task[]>([]);
  fmt = formatMinutes;
  Math = Math;

  name(): string {
    return this.auth.user()?.name ?? '';
  }

  ngOnInit(): void {
    this.api.myStats().subscribe((s) => this.stats.set(s));
    this.api.listTasks({ status: 'completed' }).subscribe((t) => this.completed.set(t.slice(0, 6)));
  }

  dash(rate: number): string {
    return `${(rate / 100) * 100} 100`;
  }
}
