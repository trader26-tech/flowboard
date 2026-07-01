import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AppSettings, ClientStats, Task } from '../../core/models';
import { formatDuration, formatMinutes } from '../../core/time.util';
import { ContributionCalendarComponent } from '../../shared/contribution-calendar.component';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [RouterLink, ContributionCalendarComponent],
  template: `
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-ink-900">Hi {{ name() }} 👋</h1>
        <p class="text-sm text-ink-500">Here's how your work is progressing.</p>
      </div>
      <a routerLink="/portal/new" class="btn-primary">＋ New request</a>
    </div>

    <!-- Presence banner -->
    @if (online()) {
      <div class="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span class="relative flex h-2.5 w-2.5">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
        </span>
        <div class="min-w-0">
          @if (activeMine(); as t) {
            <p class="text-sm font-semibold text-emerald-900">Working on your task right now</p>
            <p class="truncate text-xs text-emerald-700">
              {{ t.title }} · {{ liveTime(t) }} tracked
              @if (t.progress_percent) { · {{ t.progress_percent }}% done }
            </p>
          } @else {
            <p class="text-sm font-semibold text-emerald-900">We're online and working now</p>
            <p class="text-xs text-emerald-700">Your requests are actively being worked through.</p>
          }
        </div>
      </div>
    } @else {
      <div class="mb-5 flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3">
        <span class="h-2.5 w-2.5 rounded-full bg-ink-300"></span>
        <p class="text-sm text-ink-500">Currently offline — work resumes during working hours.</p>
      </div>
    }

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

    <!-- Upcoming with tentative ETAs -->
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Coming up</h2>
    @if (!upcoming().length) {
      <div class="card mb-6 grid place-items-center py-10 text-center text-ink-400">
        <span class="text-2xl">📭</span>
        <p class="mt-2 text-sm">No active requests. Submit a new one to get started.</p>
      </div>
    } @else {
      <div class="mb-6 space-y-2.5">
        @for (t of upcoming(); track t.id) {
          <div class="card flex flex-wrap items-center gap-3 p-4">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full"
                  [class.bg-emerald-500]="t.status === 'in_progress'"
                  [class.bg-sky-400]="t.status === 'scheduled'"
                  [class.bg-ink-300]="t.status === 'requested'"></span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate font-semibold text-ink-900">{{ t.title }}</h3>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                <span class="chip" [class]="statusCls(t)">{{ statusLabel(t) }}</span>
                @if (t.planned_end) {
                  <span>🏁 Tentative finish <b class="text-ink-700">{{ etaLabel(t) }}</b></span>
                } @else if (t.status === 'requested') {
                  <span class="text-ink-400">Awaiting scheduling</span>
                }
              </div>
              @if (t.progress_points.length) {
                <div class="mt-2 flex items-center gap-2">
                  <div class="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-ink-100">
                    <div class="h-full rounded-full bg-emerald-500 transition-all" [style.width.%]="t.progress_percent"></div>
                  </div>
                  <span class="shrink-0 text-[11px] text-ink-400">{{ t.progress_percent }}%</span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- Completion calendar -->
    <div class="mb-6">
      <app-contribution-calendar title="Your completion activity" [tasks]="completed()" />
    </div>
  `,
})
export class ClientDashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  stats = signal<ClientStats | null>(null);
  all = signal<Task[]>([]);
  online = signal(false);
  private now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  fmt = formatMinutes;

  completed = computed(() => this.all().filter((t) => t.status === 'completed'));
  activeMine = computed(() => this.all().find((t) => t.status === 'in_progress') ?? null);
  upcoming = computed(() =>
    this.all()
      .filter((t) => t.status === 'in_progress' || t.status === 'scheduled' || t.status === 'requested')
      .sort((a, b) => {
        const rank: Record<string, number> = { in_progress: 0, scheduled: 1, requested: 2 };
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        return (a.planned_start || a.created_at).localeCompare(b.planned_start || b.created_at);
      })
      .slice(0, 6),
  );

  name(): string {
    return this.auth.user()?.name ?? '';
  }

  ngOnInit(): void {
    this.api.myTasks().subscribe((t) => this.all.set(t));
    this.api.myStats().subscribe((s) => this.stats.set(s));
    this.api.getSettings().subscribe((s: AppSettings) => this.online.set(!!s.admin_online));
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  liveTime(t: Task): string {
    let seconds = t.accumulated_seconds || 0;
    if (t.status === 'in_progress' && t.timer_started_at) {
      seconds += Math.max(0, Math.floor((this.now() - new Date(t.timer_started_at).getTime()) / 1000));
    }
    return formatDuration(seconds);
  }

  etaLabel(t: Task): string {
    if (!t.planned_end) return '';
    const d = new Date(t.planned_end);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (sameDay) return `today ${time}`;
    return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
  }

  statusLabel(t: Task): string {
    return (
      { requested: 'Requested', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' } as Record<string, string>
    )[t.status] ?? t.status;
  }
  statusCls(t: Task): string {
    return (
      {
        requested: 'bg-ink-100 text-ink-600',
        scheduled: 'bg-sky-50 text-sky-700',
        in_progress: 'bg-emerald-100 text-emerald-700',
        completed: 'bg-emerald-50 text-emerald-700',
        cancelled: 'bg-rose-50 text-rose-600',
      } as Record<string, string>
    )[t.status] ?? 'bg-ink-100 text-ink-600';
  }

  dash(rate: number): string {
    return `${(rate / 100) * 100} 100`;
  }
}
