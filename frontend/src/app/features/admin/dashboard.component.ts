import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/api.service';
import { ClientStats } from '../../core/models';
import { contrastText, formatMinutes } from '../../core/time.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="mb-6">
      <h1 class="text-xl font-bold tracking-tight text-ink-900">Dashboard</h1>
      <p class="text-sm text-ink-500">Progress across every client.</p>
    </div>

    <!-- Totals -->
    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="card p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-ink-400">Total tasks</p>
        <p class="mt-1 text-2xl font-bold text-ink-900">{{ totals().total }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-ink-400">Completed</p>
        <p class="mt-1 text-2xl font-bold text-emerald-600">{{ totals().completed }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-ink-400">In progress</p>
        <p class="mt-1 text-2xl font-bold text-ink-800">{{ totals().inProgress }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-ink-400">Pending</p>
        <p class="mt-1 text-2xl font-bold text-amber-600">{{ totals().pending }}</p>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="border-b border-ink-100 px-5 py-3 text-sm font-semibold text-ink-700">Per-client progress</div>
      @if (!stats().length) {
        <p class="px-5 py-10 text-center text-sm text-ink-400">No client data yet.</p>
      }
      <div class="divide-y divide-ink-100">
        @for (s of stats(); track s.client_id) {
          <div class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold"
                    [style.background]="s.client_color" [style.color]="contrast(s.client_color)">
                {{ initials(s.client_name) }}
              </span>
              <div class="min-w-0">
                <p class="truncate font-semibold text-ink-900">{{ s.client_name }}</p>
                <p class="text-xs text-ink-400">
                  {{ s.completed_tasks }}/{{ s.total_tasks }} done · est {{ fmt(s.estimated_minutes_total) }} · tracked {{ fmt(s.actual_minutes_total) }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3 sm:w-72">
              <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                <div class="h-full rounded-full transition-all"
                     [style.width.%]="s.completion_rate" [style.background]="s.client_color"></div>
              </div>
              <span class="w-12 text-right text-sm font-semibold text-ink-700">{{ s.completion_rate }}%</span>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  stats = signal<ClientStats[]>([]);
  contrast = contrastText;
  fmt = formatMinutes;

  totals = computed(() => {
    const s = this.stats();
    return {
      total: s.reduce((a, c) => a + c.total_tasks, 0),
      completed: s.reduce((a, c) => a + c.completed_tasks, 0),
      inProgress: s.reduce((a, c) => a + c.in_progress_tasks, 0),
      pending: s.reduce((a, c) => a + c.pending_tasks, 0),
    };
  });

  ngOnInit(): void {
    this.api.clientStats().subscribe((s) => this.stats.set(s));
  }

  initials(name: string): string {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }
}
