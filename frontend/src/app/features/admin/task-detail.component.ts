import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { ProgressPoint, Task } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { contrastText, formatDuration, formatMinutes, prettyDate } from '../../core/time.util';

/**
 * Full task detail drawer. Shows everything about a task (description, client, times,
 * proof) and lets the admin manage its progress checklist. Timer/schedule/complete/delete
 * actions are emitted upward so the parent owns the day-level state.
 */
@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [FormsModule, CdkDropList, CdkDrag],
  template: `
    <div class="fixed inset-0 z-50 flex justify-end bg-ink-900/40 animate-fade-in" (click)="close.emit()">
      <div
        class="flex h-full w-full max-w-lg flex-col bg-white shadow-float"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
          <span class="mt-0.5 h-3 w-3 shrink-0 rounded-full" [style.background]="task.client_color || '#94a3b8'"></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-ink-500">{{ task.client_name }}</span>
              <span class="chip" [class]="statusCls()">{{ statusLabel() }}</span>
            </div>
            @if (!editing()) {
              <h2 class="mt-1 text-lg font-bold leading-snug tracking-tight text-ink-900">{{ task.title }}</h2>
            } @else {
              <input class="input mt-1 font-semibold" [(ngModel)]="draft.title" />
            }
          </div>
          <button class="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100" (click)="close.emit()" title="Close">✕</button>
        </div>

        <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <!-- DETAILS FIRST: full description + every fact about the task -->
          @if (!editing()) {
            <div>
              <div class="mb-2 flex items-center justify-between">
                <p class="section-title">Description</p>
                <button class="btn-outline btn-sm" (click)="startEdit()">✎ Edit details</button>
              </div>
              <div class="rounded-lg border border-ink-100 bg-ink-50/60 px-3.5 py-3">
                <p class="whitespace-pre-wrap break-words text-sm leading-relaxed"
                   [class.text-ink-700]="task.description"
                   [class.text-ink-400]="!task.description">
                  {{ task.description || 'No description was provided for this task.' }}
                </p>
              </div>

              <div class="mt-3 grid grid-cols-2 gap-2.5">
                <div class="rounded-lg bg-ink-50 px-3 py-2">
                  <p class="text-[11px] text-ink-400">Client</p>
                  <p class="flex items-center gap-1.5 truncate text-sm font-semibold text-ink-800">
                    <span class="h-2 w-2 shrink-0 rounded-full" [style.background]="task.client_color || '#94a3b8'"></span>
                    {{ task.client_name || '—' }}
                  </p>
                </div>
                <div class="rounded-lg bg-ink-50 px-3 py-2">
                  <p class="text-[11px] text-ink-400">Status</p>
                  <p class="text-sm font-semibold text-ink-800">{{ statusLabel() }}</p>
                </div>
                <!-- Estimate: click to edit -->
                <button class="group rounded-lg border border-dashed border-ink-200 bg-ink-50 px-3 py-2 text-left transition hover:border-ink-400 hover:bg-white"
                        (click)="startEdit()" title="Click to edit the estimate">
                  <p class="flex items-center gap-1 text-[11px] text-ink-400">Estimate <span class="opacity-0 transition group-hover:opacity-100">✎</span></p>
                  <p class="text-sm font-semibold text-ink-800">{{ formatMinutes(task.estimated_minutes) }}</p>
                </button>
                <div class="rounded-lg bg-ink-50 px-3 py-2">
                  <p class="text-[11px] text-ink-400">Time tracked</p>
                  <p class="text-sm font-semibold text-ink-800">{{ tracked() }}</p>
                </div>
                @if (task.scheduled_date) {
                  <div class="rounded-lg bg-ink-50 px-3 py-2">
                    <p class="text-[11px] text-ink-400">Scheduled for</p>
                    <p class="text-sm font-semibold text-ink-800">{{ prettyDate(task.scheduled_date) }}</p>
                  </div>
                }
                @if (task.planned_end) {
                  <div class="rounded-lg bg-ink-50 px-3 py-2">
                    <p class="text-[11px] text-ink-400">Tentative finish</p>
                    <p class="text-sm font-semibold text-ink-800">{{ clock(task.planned_end) }}</p>
                  </div>
                }
                <div class="rounded-lg bg-ink-50 px-3 py-2">
                  <p class="text-[11px] text-ink-400">Requested on</p>
                  <p class="text-sm font-semibold text-ink-800">{{ fmtDate(task.created_at) }}</p>
                </div>
              </div>
            </div>
          } @else {
            <div>
              <p class="section-title mb-2">Edit details</p>
              <div class="space-y-3">
                <div>
                  <label class="label">Title</label>
                  <input class="input" [(ngModel)]="draft.title" />
                </div>
                <div>
                  <label class="label">Description</label>
                  <textarea class="input min-h-[110px]" [(ngModel)]="draft.description" placeholder="Add context, links, requirements…"></textarea>
                </div>
                <div>
                  <label class="label">Estimated time</label>
                  <div class="mb-2 flex flex-wrap gap-1.5">
                    @for (opt of estimateChips; track opt.min) {
                      <button type="button" class="btn-sm"
                              [class]="draft.estimated_minutes === opt.min ? 'btn-primary' : 'btn-outline'"
                              (click)="draft.estimated_minutes = opt.min">{{ opt.label }}</button>
                    }
                  </div>
                  <div class="flex items-center gap-2">
                    <input type="number" min="0" class="input max-w-[140px]" [(ngModel)]="draft.estimated_minutes" placeholder="minutes" />
                    <span class="text-xs text-ink-400">minutes</span>
                  </div>
                </div>
                <div class="flex gap-2 pt-1">
                  <button class="btn-primary btn-sm" (click)="saveEdit()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save changes' }}</button>
                  <button class="btn-outline btn-sm" (click)="editing.set(false)">Cancel</button>
                </div>
              </div>
            </div>
          }

          <!-- Progress overview -->
          <div>
            <div class="mb-1.5 flex items-center justify-between text-xs">
              <span class="font-semibold text-ink-600">Progress</span>
              <span class="tabular-nums text-ink-500">{{ doneCount() }}/{{ points().length }} · {{ percent() }}%</span>
            </div>
            <div class="h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div class="h-full rounded-full bg-emerald-500 transition-all" [style.width.%]="percent()"></div>
            </div>
          </div>

          <!-- Progress points editor -->
          <div>
            <p class="section-title mb-2">Progress points</p>
            @if (!points().length) {
              <p class="rounded-lg bg-ink-50 px-3 py-3 text-center text-xs text-ink-400">
                No milestones yet. Break the task into steps below — the bar fills as you tick them off.
              </p>
            }
            <div cdkDropList (cdkDropListDropped)="reorder($event)" class="space-y-1.5">
              @for (p of points(); track p.id; let i = $index) {
                <div cdkDrag class="group flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-2">
                  <span class="cursor-grab text-ink-300 opacity-0 transition group-hover:opacity-100" cdkDragHandle>⠿</span>
                  <button
                    class="grid h-5 w-5 shrink-0 place-items-center rounded-md border transition"
                    [class]="p.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 text-transparent hover:border-ink-400'"
                    (click)="toggle(i)"
                  >✓</button>
                  <input
                    class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink-800 focus:outline-none"
                    [class.line-through]="p.done"
                    [class.text-ink-400]="p.done"
                    [(ngModel)]="p.label"
                    (blur)="persist()"
                    placeholder="Describe this step…"
                  />
                  <button class="text-ink-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100" (click)="removePoint(i)">✕</button>
                </div>
              }
            </div>
            <div class="mt-2 flex gap-2">
              <input
                class="input py-1.5 text-sm"
                [(ngModel)]="newLabel"
                (keyup.enter)="addPoint()"
                placeholder="Add a step and press Enter…"
              />
              <button class="btn-outline btn-sm shrink-0" (click)="addPoint()" [disabled]="!newLabel.trim()">Add</button>
            </div>
          </div>

          <!-- Completion proof -->
          @if (task.status === 'completed' && (task.proof_image_url || task.completion_note)) {
            <div>
              <p class="section-title mb-2">Delivered</p>
              @if (task.proof_image_url && !imgBroken()) {
                <a [href]="task.proof_image_url" target="_blank" rel="noopener"
                   class="block overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                  <img [src]="task.proof_image_url" (error)="imgBroken.set(true)"
                       class="max-h-72 w-full object-contain" alt="proof" />
                </a>
              } @else if (task.proof_image_url) {
                <div class="flex items-center gap-2 rounded-lg border border-dashed border-ink-200 bg-ink-50 px-3 py-3 text-xs text-ink-500">
                  <span>📎</span>
                  <span>Attachment couldn't be loaded.
                    <a [href]="task.proof_image_url" target="_blank" rel="noopener" class="text-ink-700 underline">Open in new tab</a>
                  </span>
                </div>
              }
              @if (task.completion_note) {
                <p class="mt-2 rounded-lg bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800">{{ task.completion_note }}</p>
              }
            </div>
          }
        </div>

        <!-- Action bar -->
        <div class="flex flex-wrap items-center gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3">
          @if (task.status !== 'completed') {
            @if (!task.scheduled_date) {
              <button class="btn-primary btn-sm" (click)="requestSchedule.emit(task)">＋ Add to day</button>
            }
            @if (task.status === 'in_progress') {
              <button class="btn-outline btn-sm" (click)="pause()">⏸ Pause</button>
            } @else {
              <button class="btn-primary btn-sm" (click)="start()">▶ Start</button>
            }
            <button class="btn-success btn-sm" (click)="requestComplete.emit(task)">✓ Complete</button>
            @if (task.scheduled_date) {
              <button class="btn-ghost btn-sm text-ink-500" (click)="requestUnschedule.emit(task)" title="Move to backlog">↩ Backlog</button>
            }
          }
          <button class="btn-danger btn-sm ml-auto" (click)="requestDelete.emit(task)">Delete</button>
        </div>
      </div>
    </div>
  `,
})
export class TaskDetailComponent {
  @Input({ required: true }) set task(value: Task) {
    this._task = value;
    this.points.set((value.progress_points ?? []).map((p) => ({ ...p })));
    this.imgBroken.set(false);
  }
  get task(): Task {
    return this._task;
  }
  private _task!: Task;

  @Output() close = new EventEmitter<void>();
  @Output() changed = new EventEmitter<Task>();
  @Output() requestComplete = new EventEmitter<Task>();
  @Output() requestSchedule = new EventEmitter<Task>();
  @Output() requestUnschedule = new EventEmitter<Task>();
  @Output() requestDelete = new EventEmitter<Task>();

  private api = inject(ApiService);
  private toast = inject(ToastService);

  formatMinutes = formatMinutes;
  prettyDate = prettyDate;
  contrast = contrastText;

  points = signal<ProgressPoint[]>([]);
  imgBroken = signal(false);
  newLabel = '';
  editing = signal(false);
  saving = signal(false);
  draft: { title: string; description: string; estimated_minutes: number | null } = {
    title: '',
    description: '',
    estimated_minutes: null,
  };
  estimateChips = [
    { label: '15m', min: 15 },
    { label: '30m', min: 30 },
    { label: '45m', min: 45 },
    { label: '1h', min: 60 },
    { label: '1h 30m', min: 90 },
    { label: '2h', min: 120 },
  ];

  doneCount = computed(() => this.points().filter((p) => p.done).length);
  percent = computed(() => {
    const n = this.points().length;
    return n ? Math.round((this.doneCount() / n) * 100) : this.task?.progress_percent ?? 0;
  });

  tracked(): string {
    return formatDuration(this.task.elapsed_seconds || this.task.accumulated_seconds || 0);
  }
  clock(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  statusLabel(): string {
    return (
      { requested: 'Backlog', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' } as Record<string, string>
    )[this.task.status] ?? this.task.status;
  }
  statusCls(): string {
    return (
      {
        requested: 'bg-ink-100 text-ink-600',
        scheduled: 'bg-sky-50 text-sky-700',
        in_progress: 'bg-emerald-100 text-emerald-700',
        completed: 'bg-emerald-50 text-emerald-700',
        cancelled: 'bg-rose-50 text-rose-600',
      } as Record<string, string>
    )[this.task.status] ?? 'bg-ink-100 text-ink-600';
  }

  // ── Progress points ─────────────────────────────────────────────────────────
  addPoint(): void {
    const label = this.newLabel.trim();
    if (!label) return;
    this.points.update((ps) => [...ps, { id: this.uid(), label, done: false }]);
    this.newLabel = '';
    this.persist();
  }
  toggle(i: number): void {
    this.points.update((ps) => ps.map((p, idx) => (idx === i ? { ...p, done: !p.done } : p)));
    this.persist();
  }
  removePoint(i: number): void {
    this.points.update((ps) => ps.filter((_, idx) => idx !== i));
    this.persist();
  }
  reorder(event: CdkDragDrop<ProgressPoint[]>): void {
    const list = [...this.points()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.points.set(list);
    this.persist();
  }
  persist(): void {
    const clean = this.points()
      .map((p) => ({ ...p, label: p.label.trim() }))
      .filter((p) => p.label);
    this.api.setProgress(this.task.id, clean).subscribe({
      next: (t) => {
        this._task = t;
        this.points.set((t.progress_points ?? []).map((p) => ({ ...p })));
        this.changed.emit(t);
      },
      error: (e) => this.toast.error(e?.error?.detail ?? 'Could not save progress'),
    });
  }

  // ── Details editing ─────────────────────────────────────────────────────────
  startEdit(): void {
    this.draft = {
      title: this.task.title,
      description: this.task.description ?? '',
      estimated_minutes: this.task.estimated_minutes,
    };
    this.editing.set(true);
  }
  /** Coerce the estimate input (number, '', or null) to a clean int or null. */
  private normalizedEstimate(): number | null {
    const v = this.draft.estimated_minutes as unknown;
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  saveEdit(): void {
    this.saving.set(true);
    this.api
      .updateTask(this.task.id, {
        title: this.draft.title.trim() || this.task.title,
        description: this.draft.description.trim() || null,
        estimated_minutes: this.normalizedEstimate(),
      })
      .subscribe({
        next: (t) => {
          this._task = t;
          this.saving.set(false);
          this.editing.set(false);
          this.toast.success('Task updated');
          this.changed.emit(t);
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(e?.error?.detail ?? 'Could not update');
        },
      });
  }

  // ── Timer ───────────────────────────────────────────────────────────────────
  start(): void {
    this.api.startTimer(this.task.id).subscribe({
      next: (t) => { this._task = t; this.toast.success('Timer started'); this.changed.emit(t); },
      error: (e) => this.toast.error(e?.error?.detail ?? 'Could not start'),
    });
  }
  pause(): void {
    this.api.pauseTimer(this.task.id).subscribe({
      next: (t) => { this._task = t; this.changed.emit(t); },
      error: (e) => this.toast.error(e?.error?.detail ?? 'Could not pause'),
    });
  }

  private uid(): string {
    return (crypto as any)?.randomUUID?.() ?? 'p_' + Math.random().toString(36).slice(2, 10);
  }
}
