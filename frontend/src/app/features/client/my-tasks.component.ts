import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/api.service';
import { Task, TaskStatus } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { formatMinutes, prettyDate } from '../../core/time.util';

const STATUS_META: Record<TaskStatus, { label: string; cls: string }> = {
  requested: { label: 'Requested', cls: 'bg-ink-100 text-ink-600' },
  scheduled: { label: 'Scheduled', cls: 'bg-sky-50 text-sky-700' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-50 text-rose-600' },
};

@Component({
  selector: 'app-my-tasks',
  standalone: true,
  template: `
    <div class="mb-6">
      <h1 class="text-xl font-bold tracking-tight text-ink-900">My requests</h1>
      <p class="text-sm text-ink-500">Track the status of everything you've submitted.</p>
    </div>

    <div class="mb-5 flex flex-wrap gap-2">
      @for (f of filters; track f.value) {
        <button class="btn-sm" [class]="filter() === f.value ? 'btn-primary' : 'btn-outline'"
                (click)="filter.set(f.value)">{{ f.label }}</button>
      }
    </div>

    @if (!visible().length) {
      <div class="card grid place-items-center py-16 text-center text-ink-400">
        <span class="text-3xl">📋</span>
        <p class="mt-2 text-sm">Nothing here yet.</p>
      </div>
    }

    <div class="space-y-3">
      @for (t of visible(); track t.id) {
        <div class="card p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="chip" [class]="meta(t.status).cls">{{ meta(t.status).label }}</span>
                @if (t.scheduled_date && t.status !== 'completed') {
                  <span class="text-xs text-ink-400">Planned {{ pretty(t.scheduled_date) }}</span>
                }
              </div>
              <h3 class="mt-2 font-semibold text-ink-900">{{ t.title }}</h3>
              @if (t.description) { <p class="mt-1 text-sm text-ink-500">{{ t.description }}</p> }
              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
                <span>Estimate {{ fmt(t.estimated_minutes) }}</span>
                @if (t.planned_end && t.status !== 'completed') {
                  <span>🏁 Tentative finish <b class="text-ink-600">{{ eta(t) }}</b></span>
                }
              </div>
              @if (t.progress_points.length && t.status !== 'completed') {
                <div class="mt-2.5 max-w-sm">
                  <div class="mb-1 flex items-center justify-between text-[11px] text-ink-500">
                    <span>Progress</span>
                    <span>{{ t.progress_percent }}% · {{ doneOf(t) }}</span>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div class="h-full rounded-full bg-emerald-500 transition-all" [style.width.%]="t.progress_percent"></div>
                  </div>
                </div>
              }
            </div>

            <div class="flex items-center gap-3">
              @if (t.proof_image_url) {
                <a [href]="t.proof_image_url" target="_blank" rel="noopener">
                  <img [src]="t.proof_image_url" class="h-16 w-16 rounded-lg object-cover" alt="proof" />
                </a>
              }
              @if (t.status === 'requested') {
                <button class="btn-sm btn-danger" (click)="cancel(t)">Cancel</button>
              }
            </div>
          </div>
          @if (t.completion_note) {
            <p class="mt-3 rounded-lg bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800">{{ t.completion_note }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class MyTasksComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  tasks = signal<Task[]>([]);
  filter = signal<'all' | TaskStatus>('all');
  fmt = formatMinutes;
  pretty = prettyDate;

  filters: { label: string; value: 'all' | TaskStatus }[] = [
    { label: 'All', value: 'all' },
    { label: 'Requested', value: 'requested' },
    { label: 'Scheduled', value: 'scheduled' },
    { label: 'In progress', value: 'in_progress' },
    { label: 'Completed', value: 'completed' },
  ];

  visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.tasks() : this.tasks().filter((t) => t.status === f);
  });

  ngOnInit(): void {
    this.load();
  }
  load(): void {
    this.api.myTasks().subscribe((t) => this.tasks.set(t));
  }

  meta(status: TaskStatus) {
    return STATUS_META[status];
  }

  doneOf(t: Task): string {
    const pts = t.progress_points ?? [];
    return `${pts.filter((p) => p.done).length}/${pts.length}`;
  }

  eta(t: Task): string {
    if (!t.planned_end) return '';
    const d = new Date(t.planned_end);
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return sameDay
      ? `today ${time}`
      : `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
  }

  cancel(t: Task): void {
    this.api.deleteTask(t.id).subscribe({
      next: () => { this.toast.info('Request cancelled'); this.load(); },
      error: (e) => this.toast.error(e?.error?.detail ?? 'Could not cancel'),
    });
  }
}
