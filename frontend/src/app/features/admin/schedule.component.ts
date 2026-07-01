import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AppSettings, Task, User } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { addDays, formatDuration, formatMinutes, prettyDate, todayKey } from '../../core/time.util';
import { CompleteModalComponent } from './complete-modal.component';
import { TaskDetailComponent } from './task-detail.component';

const PX_PER_MIN = 1.5;
const MIN_BLOCK_PX = 72;
const ROW_GAP = 6; // matches mb-1.5 between blocks

interface Row {
  task: Task;
  startMin: number;
  durMin: number;
  heightPx: number;
  topPx: number;
  startLabel: string;
  endLabel: string;
}

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    FormsModule,
    CompleteModalComponent,
    TaskDetailComponent,
  ],
  template: `
    <!-- Header -->
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-ink-900">Schedule</h1>
        <p class="mt-0.5 text-sm text-ink-500">
          {{ prettyDate(date()) }} · {{ rangeLabel() }}
          @if (isToday()) { <span class="ml-1 font-medium text-rose-500">· now {{ nowLabel() }}</span> }
        </p>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                (click)="openUrgent()" title="Drop an urgent task at the front and start it now">
          ⚡ Urgent
        </button>
        <span class="mx-1 h-5 w-px bg-ink-200"></span>
        <button class="btn-outline px-2.5" (click)="shift(-1)" aria-label="Previous day">‹</button>
        <button class="btn-outline" (click)="goToday()">Today</button>
        <button class="btn-outline px-2.5" (click)="shift(1)" aria-label="Next day">›</button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-ink-200 bg-ink-50/60 px-4 py-2.5 text-sm">
      <div class="flex items-center gap-2">
        <span class="font-medium text-ink-600">Working hours</span>
        <input type="time" class="input w-28 py-1" [(ngModel)]="startTime" />
        <span class="text-ink-400">→</span>
        <input type="time" class="input w-28 py-1" [(ngModel)]="endTime" />
        <button class="btn-primary btn-sm" (click)="saveTimes()">Apply</button>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-medium text-ink-600">Start tasks at</span>
        <input type="time" class="input w-28 py-1" [ngModel]="startAt()" (ngModelChange)="startAt.set($event)" />
        <button class="btn-outline btn-sm" (click)="setStartNow()" title="Begin from the current time">Now</button>
      </div>
      <div class="ml-auto flex items-center gap-4">
        <span class="text-ink-500">Planned <b class="text-ink-800">{{ formatMinutes(scheduledMin()) }}</b></span>
        <span [class]="overCapacity() ? 'font-semibold text-rose-600' : 'text-emerald-600'">
          {{ overCapacity() ? ('Over by ' + formatMinutes(-freeMin())) : (formatMinutes(freeMin()) + ' free') }}
        </span>
      </div>
    </div>

    <!-- Carry-forward banner -->
    @if (overdue().length) {
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
        <span class="text-sm text-amber-800"><b>{{ overdue().length }}</b> unfinished task(s) from earlier days.</span>
        <button class="btn-sm btn-outline border-amber-300 text-amber-800 hover:bg-amber-100" (click)="carryForward()">
          Carry forward to {{ prettyDate(date()) }}
        </button>
      </div>
    }

    <!-- Working-now hero -->
    <div class="mb-5">
      @if (activeTask(); as t) {
        <div class="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <span class="absolute inset-y-0 left-0 w-1.5" [style.background]="t.client_color || '#10b981'"></span>
          <div class="flex flex-col gap-4 pl-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span> Working now
                </span>
                <span class="flex items-center gap-1.5 text-xs font-medium text-ink-500">
                  <span class="h-2 w-2 rounded-full" [style.background]="t.client_color"></span>{{ t.client_name }}
                </span>
              </div>
              <h2 class="mt-2 cursor-pointer truncate text-lg font-bold tracking-tight text-ink-900 hover:underline" (click)="openDetail(t)">{{ t.title }}</h2>
              @if (t.progress_points.length) {
                <div class="mt-3 max-w-md">
                  <div class="mb-1 flex items-center justify-between text-[11px] text-ink-500">
                    <span>Checklist</span>
                    <span>{{ t.progress_percent }}% · {{ doneOf(t) }}</span>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div class="h-full rounded-full bg-emerald-500 transition-all" [style.width.%]="t.progress_percent"></div>
                  </div>
                </div>
              } @else if (t.estimated_minutes) {
                <div class="mt-3 max-w-md">
                  <div class="mb-1 flex items-center justify-between text-[11px] text-ink-500">
                    <span>{{ heroOver() ? 'Over estimate' : 'In progress' }}</span>
                    <span>Est {{ formatMinutes(t.estimated_minutes) }}</span>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div class="h-full rounded-full transition-all"
                         [class]="heroOver() ? 'bg-rose-500' : 'bg-emerald-500'"
                         [style.width.%]="heroPercent()"></div>
                  </div>
                </div>
              }
            </div>
            <div class="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
              <div class="text-right">
                <div class="font-mono text-3xl font-bold tabular-nums" [class]="heroOver() ? 'text-rose-600' : 'text-ink-900'">{{ liveTime(t) }}</div>
                <div class="text-[11px] text-ink-400">since {{ clockFromIso(t.actual_start) }}</div>
              </div>
              <div class="flex gap-2">
                <button class="btn-outline btn-sm" (click)="pause(t)">⏸ Pause</button>
                <button class="btn-success btn-sm" (click)="openComplete(t)">✓ Complete</button>
              </div>
            </div>
          </div>
        </div>
      } @else {
        <div class="flex flex-col gap-3 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div class="min-w-0">
            <p class="section-title">No task running</p>
            @if (isToday()) {
              <p class="mt-1 font-mono text-2xl font-bold tabular-nums text-ink-900">{{ nowLabel() }}</p>
            }
            @if (nextTask(); as nt) {
              <p class="mt-1 truncate text-sm text-ink-500">Up next · <span class="font-semibold text-ink-700">{{ nt.title }}</span> for {{ nt.client_name }}</p>
            } @else {
              <p class="mt-1 text-sm text-ink-500">Nothing scheduled — add a task from the backlog to begin.</p>
            }
          </div>
          @if (nextTask(); as nt) {
            <button class="btn-primary shrink-0" (click)="start(nt)">▶ Start next task</button>
          }
        </div>
      }
    </div>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]" cdkDropListGroup>
      <!-- Timeline -->
      <section class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
          <h2 class="section-title">Day timeline</h2>
          <span class="text-[11px] text-ink-400">starts {{ startLabel() }} · {{ layout().length }} task(s)</span>
        </div>

        <div
          class="relative px-3 py-3"
          cdkDropList
          [cdkDropListData]="day()"
          (cdkDropListDropped)="dropInDay($event)"
          [style.minHeight.px]="140"
        >
          @if (!layout().length) {
            <div class="m-2 grid place-items-center rounded-lg border-2 border-dashed border-ink-200 py-14 text-center text-ink-400">
              <span class="text-2xl">▦</span>
              <p class="mt-2 text-sm">Add tasks from the backlog — click <b>＋ Add</b> or drag them here.</p>
            </div>
          }

          @for (row of layout(); track row.task.id) {
            <div cdkDrag [cdkDragData]="row.task" class="group flex gap-2">
              <div class="w-14 shrink-0 pt-1 text-right">
                <div class="text-xs font-semibold tabular-nums text-ink-700">{{ row.startLabel }}</div>
                <div class="text-[10px] tabular-nums text-ink-400">{{ row.endLabel }}</div>
              </div>
              <div
                class="relative mb-1.5 flex-1 cursor-pointer overflow-hidden rounded-lg border bg-white px-3 py-2 transition hover:shadow-sm"
                [class]="cardClass(row.task)"
                [style.minHeight.px]="row.heightPx"
                (click)="openDetail(row.task)"
              >
                <span class="absolute inset-y-0 left-0 w-1" [style.background]="row.task.client_color || '#94a3b8'"></span>
                <div class="flex items-start justify-between gap-2 pl-1.5">
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="h-2 w-2 shrink-0 rounded-full" [style.background]="row.task.client_color || '#94a3b8'"></span>
                      <span class="truncate text-[11px] font-medium text-ink-500">{{ row.task.client_name }}</span>
                      @if (row.task.status === 'in_progress') {
                        <span class="chip bg-emerald-100 text-emerald-700">● running</span>
                      } @else if (row.task.status === 'completed') {
                        <span class="chip bg-emerald-50 text-emerald-700">✓ done</span>
                      }
                    </div>
                    <h3 class="mt-0.5 truncate text-sm font-semibold text-ink-900">{{ row.task.title }}</h3>
                    <div class="mt-1 flex items-center gap-3 text-[11px] text-ink-500">
                      <span>Est {{ formatMinutes(row.task.estimated_minutes) }}</span>
                      <span class="font-mono font-semibold tabular-nums"
                            [class.text-emerald-600]="row.task.status === 'in_progress'">
                        {{ liveTime(row.task) }}
                      </span>
                      @if (row.task.progress_points.length) {
                        <span class="text-ink-400">· {{ doneOf(row.task) }}</span>
                      }
                    </div>
                    @if (row.task.progress_points.length && row.task.status !== 'completed') {
                      <div class="mt-1.5 h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-ink-100">
                        <div class="h-full rounded-full bg-emerald-500 transition-all" [style.width.%]="row.task.progress_percent"></div>
                      </div>
                    }
                    @if (isPaused(row.task)) {
                      <div class="mt-1.5 max-w-[200px]">
                        <div class="flex h-1.5 overflow-hidden rounded-full bg-ink-100">
                          <div class="h-full bg-emerald-500" [style.width.%]="workedPct(row.task)"></div>
                          <div class="h-full bg-amber-300" [style.width.%]="100 - workedPct(row.task)"></div>
                        </div>
                        <p class="mt-0.5 text-[10px] text-ink-400">
                          ⏸ {{ liveTime(row.task) }} done · ~{{ formatMinutes(remainingMin(row.task)) }} left
                        </p>
                      </div>
                    }
                  </div>
                  <button class="cursor-grab text-ink-300 opacity-0 transition group-hover:opacity-100" cdkDragHandle (click)="$event.stopPropagation()">⠿</button>
                </div>

                @if (row.task.status !== 'completed') {
                  <div class="mt-2 flex flex-wrap items-center gap-1.5 pl-1.5" (click)="$event.stopPropagation()">
                    @if (row.task.status === 'in_progress') {
                      <button class="btn-sm btn-outline" (click)="pause(row.task)">⏸ Pause</button>
                    } @else {
                      <button class="btn-sm btn-primary" (click)="start(row.task)">▶ Start</button>
                    }
                    <button class="btn-sm btn-success" (click)="openComplete(row.task)">✓ Complete</button>
                    <button class="btn-sm btn-ghost ml-auto text-ink-400" (click)="sendBack(row.task)" title="Move to backlog">↩</button>
                  </div>
                } @else if (row.task.proof_image_url || row.task.completion_note) {
                  <div class="mt-2 flex items-start gap-2.5 pl-1.5" (click)="$event.stopPropagation()">
                    @if (row.task.proof_image_url && !broken().has(row.task.id)) {
                      <a [href]="row.task.proof_image_url" target="_blank" rel="noopener" class="shrink-0">
                        <img [src]="row.task.proof_image_url" (error)="markBroken(row.task.id)"
                             class="h-12 w-12 rounded-md border border-ink-200 object-cover transition hover:brightness-95" alt="proof" />
                      </a>
                    } @else if (row.task.proof_image_url) {
                      <span class="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-dashed border-ink-200 bg-ink-50 text-ink-300" title="Image unavailable">📎</span>
                    }
                    @if (row.task.completion_note) {
                      <p class="line-clamp-2 pt-0.5 text-[11px] leading-relaxed text-emerald-700">{{ row.task.completion_note }}</p>
                    }
                  </div>
                }
              </div>
            </div>
          }

          <!-- Free time -->
          @if (layout().length && !overCapacity() && freeMin() > 0) {
            <div class="flex gap-2">
              <div class="w-14 shrink-0 pt-1 text-right">
                <div class="text-xs font-semibold tabular-nums text-ink-400">{{ freeStartLabel() }}</div>
              </div>
              <div class="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-ink-200 text-xs font-medium text-ink-400"
                   [style.minHeight.px]="freeHeightPx()">
                Free · {{ formatMinutes(freeMin()) }} until {{ rangeEndLabel() }}
              </div>
            </div>
          }
        </div>
      </section>

      <!-- Backlog -->
      <aside class="card h-fit overflow-hidden">
        <div class="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
          <h2 class="section-title">Backlog</h2>
          <div class="flex items-center gap-2">
            <span class="chip border border-ink-200 bg-white text-ink-500">{{ backlog().length }}</span>
            <button class="btn-primary btn-sm" (click)="openCreate()">＋ New</button>
          </div>
        </div>
        <div class="space-y-2 p-3"
             cdkDropList [cdkDropListData]="backlog()" (cdkDropListDropped)="dropInBacklog($event)"
             [style.minHeight.px]="80">
          @if (!backlog().length) {
            <p class="rounded-lg bg-ink-50 px-3 py-6 text-center text-xs text-ink-400">No unscheduled requests.</p>
          }
          @for (task of backlog(); track task.id) {
            <div cdkDrag [cdkDragData]="task"
                 class="group relative cursor-pointer overflow-hidden rounded-lg border border-ink-200 bg-white px-3 py-2.5 transition hover:border-ink-300 hover:shadow-sm"
                 (click)="openDetail(task)">
              <span class="absolute inset-y-0 left-0 w-1" [style.background]="task.client_color || '#94a3b8'"></span>
              <div class="flex items-center gap-1.5 pl-1.5">
                <span class="h-2 w-2 rounded-full" [style.background]="task.client_color || '#94a3b8'"></span>
                <span class="truncate text-[11px] font-medium text-ink-500">{{ task.client_name }}</span>
                <span class="ml-auto cursor-grab text-ink-300 opacity-0 transition group-hover:opacity-100" cdkDragHandle (click)="$event.stopPropagation()">⠿</span>
              </div>
              <h3 class="mt-0.5 truncate pl-1.5 text-sm font-semibold text-ink-900">{{ task.title }}</h3>
              <div class="mt-1 flex items-center justify-between pl-1.5">
                <p class="text-[11px] text-ink-400">Est {{ formatMinutes(task.estimated_minutes) }}</p>
                <button class="btn-sm btn-primary py-1" (click)="scheduleToDay(task); $event.stopPropagation()">＋ Add</button>
              </div>
            </div>
          }
        </div>
      </aside>
    </div>

    <!-- Create-task modal -->
    @if (showCreate()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 animate-fade-in" (click)="showCreate.set(false)">
        <div class="card w-full max-w-lg p-6" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-bold text-ink-900">New task</h3>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label">Assign to</label>
              <select class="input" [(ngModel)]="createForm.client_id">
                <option value="" disabled>Select…</option>
                <option [value]="adminId()">⭐ Myself (internal)</option>
                @for (c of clients(); track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="label">Estimated minutes (optional)</label>
              <input type="number" min="0" class="input" [(ngModel)]="createForm.estimated_minutes" placeholder="e.g. 60" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Title</label>
              <input class="input" [(ngModel)]="createForm.title" placeholder="What needs doing?" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Description (optional)</label>
              <textarea class="input min-h-[80px]" [(ngModel)]="createForm.description"></textarea>
            </div>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button class="btn-outline" (click)="showCreate.set(false)" [disabled]="creating()">Cancel</button>
            <button class="btn-primary" (click)="create()" [disabled]="creating() || !createForm.title || !createForm.client_id">
              {{ creating() ? 'Creating…' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Urgent-task modal -->
    @if (showUrgent()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 animate-fade-in" (click)="showUrgent.set(false)">
        <div class="card w-full max-w-lg p-6" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2">
            <span class="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-600">⚡</span>
            <div>
              <h3 class="text-lg font-bold text-ink-900">Urgent task</h3>
              <p class="text-xs text-ink-500">Starts now. Anything running is paused and everything below shifts down.</p>
            </div>
          </div>

          <!-- Mode toggle -->
          <div class="mt-5 flex gap-2">
            <button class="btn-sm flex-1" [class]="urgentMode() === 'new' ? 'btn-primary' : 'btn-outline'" (click)="urgentMode.set('new')">New task</button>
            <button class="btn-sm flex-1" [class]="urgentMode() === 'existing' ? 'btn-primary' : 'btn-outline'" (click)="urgentMode.set('existing')">From backlog</button>
          </div>

          @if (urgentMode() === 'new') {
            <div class="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Assign to</label>
                <select class="input" [(ngModel)]="urgentForm.client_id">
                  <option [value]="adminId()">⭐ Myself (internal)</option>
                  @for (c of clients(); track c.id) {
                    <option [value]="c.id">{{ c.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Estimated minutes</label>
                <input type="number" min="0" class="input" [(ngModel)]="urgentForm.estimated_minutes" placeholder="e.g. 30" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Title</label>
                <input class="input" [(ngModel)]="urgentForm.title" placeholder="What just came up?" />
              </div>
            </div>
          } @else {
            <div class="mt-4">
              <label class="label">Pick a backlog task</label>
              @if (!backlog().length) {
                <p class="rounded-lg bg-ink-50 px-3 py-4 text-center text-xs text-ink-400">Backlog is empty — create a new urgent task instead.</p>
              } @else {
                <select class="input" [(ngModel)]="urgentForm.task_id">
                  <option value="" disabled>Select a task…</option>
                  @for (t of backlog(); track t.id) {
                    <option [value]="t.id">{{ t.title }} — {{ t.client_name }}</option>
                  }
                </select>
              }
            </div>
          }

          @if (activeTask(); as at) {
            <p class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <b>{{ at.title }}</b> is running ({{ liveTime(at) }} done). It will be paused and resume after this urgent task.
            </p>
          }

          <div class="mt-6 flex justify-end gap-2">
            <button class="btn-outline" (click)="showUrgent.set(false)" [disabled]="urgentBusy()">Cancel</button>
            <button class="btn-primary bg-amber-600 hover:bg-amber-700" (click)="submitUrgent()" [disabled]="urgentBusy() || !urgentValid()">
              {{ urgentBusy() ? 'Starting…' : '⚡ Start now' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Task detail drawer -->
    @if (selected(); as t) {
      <app-task-detail
        [task]="t"
        (close)="selected.set(null)"
        (changed)="onDetailChanged($event)"
        (requestComplete)="onDetailComplete($event)"
        (requestSchedule)="scheduleToDay($event); selected.set(null)"
        (requestUnschedule)="sendBack($event); selected.set(null)"
        (requestDelete)="deleteTask($event)"
      />
    }

    @if (completing(); as t) {
      <app-complete-modal [task]="t" (cancel)="completing.set(null)" (completed)="onCompleted($event)" />
    }
  `,
})
export class ScheduleComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  date = signal(todayKey());
  day = signal<Task[]>([]);
  backlog = signal<Task[]>([]);
  overdue = signal<Task[]>([]);
  settings = signal<AppSettings | null>(null);
  completing = signal<Task | null>(null);
  selected = signal<Task | null>(null);

  clients = signal<User[]>([]);
  showCreate = signal(false);
  creating = signal(false);
  createForm = { title: '', description: '', estimated_minutes: null as number | null, client_id: '' };

  adminId = computed(() => this.auth.user()?.id ?? '');

  // Urgent-task modal
  showUrgent = signal(false);
  urgentBusy = signal(false);
  urgentMode = signal<'new' | 'existing'>('new');
  urgentForm = {
    title: '',
    estimated_minutes: null as number | null,
    client_id: '',
    task_id: '',
  };

  startTime = '09:00';            // working-hours window start (persisted)
  endTime = '19:00';             // working-hours window end (persisted)
  startAt = signal('09:00');     // effective "begin tasks at" for the viewed day (local)

  private now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  prettyDate = prettyDate;
  formatMinutes = formatMinutes;

  // ── Day window & effective start (minutes from midnight, local wall clock) ──
  private windowStartMin = computed(() => this.toMinutes(this.settings()?.workday_start ?? '09:00:00'));
  private windowEndMin = computed(() => this.windowStartMin() + (this.settings()?.workday_hours ?? 10) * 60);
  private effStartMin = computed(() => this.toMinutes(this.startAt()));

  isToday = computed(() => this.date() === todayKey());
  nowMin = computed(() => { const d = new Date(this.now()); return d.getHours() * 60 + d.getMinutes(); });
  nowLabel = computed(() => this.clock(this.nowMin()));

  rangeLabel = computed(() => `${this.clock(this.windowStartMin())} – ${this.clock(this.windowEndMin())}`);
  rangeEndLabel = computed(() => this.clock(this.windowEndMin()));
  startLabel = computed(() => this.clock(this.effStartMin()));

  // ── Layout: stack tasks sequentially from the effective start ──────────────
  layout = computed<Row[]>(() => {
    let cMin = this.effStartMin();
    let cPx = 0;
    return this.day().map((task) => {
      const dur = this.durationMin(task);
      const heightPx = Math.max(dur * PX_PER_MIN, MIN_BLOCK_PX);
      const row: Row = {
        task, startMin: cMin, durMin: dur, heightPx, topPx: cPx,
        startLabel: this.clock(cMin), endLabel: this.clock(cMin + dur),
      };
      cMin += dur;
      cPx += heightPx + ROW_GAP;
      return row;
    });
  });

  scheduledMin = computed(() => this.layout().reduce((s, r) => s + r.durMin, 0));
  private cursorEndMin = computed(() => this.effStartMin() + this.scheduledMin());
  freeMin = computed(() => this.windowEndMin() - this.cursorEndMin());
  overCapacity = computed(() => this.freeMin() < 0);
  freeHeightPx = computed(() => Math.max(this.freeMin() * PX_PER_MIN, 48));
  freeStartLabel = computed(() => this.clock(this.cursorEndMin()));

  // ── "Working now" hero ──────────────────────────────────────────────────────
  activeTask = computed(() => this.day().find((t) => t.status === 'in_progress') ?? null);
  nextTask = computed(() => this.day().find((t) => t.status === 'scheduled') ?? null);
  heroPercent = computed(() => {
    const t = this.activeTask();
    if (!t || !t.estimated_minutes) return 0;
    return Math.min(100, (this.liveSeconds(t) / (t.estimated_minutes * 60)) * 100);
  });
  heroOver = computed(() => {
    const t = this.activeTask();
    return !!t && !!t.estimated_minutes && this.liveSeconds(t) > t.estimated_minutes * 60;
  });

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) => {
      this.settings.set(s);
      this.startTime = (s.workday_start ?? '09:00:00').slice(0, 5);
      this.endTime = this.clock24(this.windowEndMin());
      this.initStartAt();
    });
    this.api.listClients().subscribe((c) => this.clients.set(c));
    this.load();
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  load(): void {
    const d = this.date();
    this.api.daySchedule(d).subscribe((tasks) => {
      this.day.set(tasks);
      this.syncSelected(tasks);
    });
    this.api.backlog().subscribe((tasks) => {
      this.backlog.set(tasks);
      this.syncSelected(tasks);
    });
    this.api.overdue(d).subscribe((tasks) => this.overdue.set(tasks));
  }

  /** Keep the open drawer in sync with freshly-loaded task data. */
  private syncSelected(tasks: Task[]): void {
    const cur = this.selected();
    if (!cur) return;
    const match = tasks.find((t) => t.id === cur.id);
    if (match) this.selected.set(match);
  }

  /** Today defaults to "now" (or window start if earlier); other days to window start. */
  private initStartAt(): void {
    const ws = this.windowStartMin();
    if (this.date() === todayKey()) {
      const d = new Date();
      this.startAt.set(this.clock24(Math.max(ws, d.getHours() * 60 + d.getMinutes())));
    } else {
      this.startAt.set(this.clock24(ws));
    }
  }
  setStartNow(): void {
    const d = new Date();
    this.startAt.set(this.clock24(d.getHours() * 60 + d.getMinutes()));
  }

  shift(delta: number): void {
    this.date.set(addDays(this.date(), delta));
    this.initStartAt();
    this.load();
  }
  goToday(): void {
    this.date.set(todayKey());
    this.initStartAt();
    this.load();
  }

  saveTimes(): void {
    const startMin = this.toMinutes(this.startTime);
    const endMin = this.toMinutes(this.endTime);
    if (endMin <= startMin) {
      this.toast.error('End time must be after start time');
      return;
    }
    const hours = Math.max(1, Math.round((endMin - startMin) / 60));
    this.api.updateSettings({ workday_start: `${this.startTime}:00`, workday_hours: hours }).subscribe({
      next: (s) => {
        this.settings.set(s);
        this.endTime = this.clock24(this.windowEndMin());
        this.initStartAt();
        this.toast.success('Working hours updated');
      },
      error: (e) => this.toast.error(e?.error?.detail ?? 'Could not save'),
    });
  }

  // ── Detail drawer ────────────────────────────────────────────────────────────
  openDetail(task: Task): void { this.selected.set(task); }
  onDetailChanged(task: Task): void {
    this.selected.set(task);
    // Reflect edits in whichever list holds the task.
    this.day.update((l) => l.map((t) => (t.id === task.id ? task : t)));
    this.backlog.update((l) => l.map((t) => (t.id === task.id ? task : t)));
  }
  onDetailComplete(task: Task): void {
    this.selected.set(null);
    this.openComplete(task);
  }
  deleteTask(task: Task): void {
    this.api.deleteTask(task.id).subscribe({
      next: () => { this.selected.set(null); this.toast.info('Task deleted'); this.load(); },
      error: (e) => this.handleErr(e),
    });
  }

  // ── Create task ───────────────────────────────────────────────────────────────
  openCreate(): void {
    // Default the assignee to the admin themselves ("Myself / internal").
    this.createForm = { title: '', description: '', estimated_minutes: null, client_id: this.adminId() };
    this.showCreate.set(true);
  }
  create(): void {
    if (this.creating() || !this.createForm.title.trim() || !this.createForm.client_id) return; // guard double-submit
    this.creating.set(true);
    this.api
      .createTask({
        title: this.createForm.title.trim(),
        description: this.createForm.description.trim() || null,
        estimated_minutes: this.createForm.estimated_minutes,
        client_id: this.createForm.client_id,
      })
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.toast.success('Task created');
          this.createForm = { title: '', description: '', estimated_minutes: null, client_id: this.adminId() };
          this.showCreate.set(false);
          this.load();
        },
        error: (e) => {
          this.creating.set(false);
          this.toast.error(e?.error?.detail ?? 'Could not create task');
        },
      });
  }

  scheduleToDay(task: Task): void {
    this.api.scheduleTask(task.id, this.date()).subscribe({
      next: () => { this.toast.success('Added to ' + prettyDate(this.date())); this.load(); },
      error: (e) => this.handleErr(e),
    });
  }

  // ── Urgent task ───────────────────────────────────────────────────────────────
  openUrgent(): void {
    this.urgentMode.set('new');
    this.urgentForm = { title: '', estimated_minutes: null, client_id: this.adminId(), task_id: '' };
    this.showUrgent.set(true);
  }
  urgentValid(): boolean {
    return this.urgentMode() === 'new'
      ? !!this.urgentForm.title.trim()
      : !!this.urgentForm.task_id;
  }
  submitUrgent(): void {
    if (!this.urgentValid()) return;
    this.urgentBusy.set(true);
    const body =
      this.urgentMode() === 'new'
        ? {
            title: this.urgentForm.title.trim(),
            estimated_minutes: this.urgentForm.estimated_minutes,
            client_id: this.urgentForm.client_id || this.adminId(),
            scheduled_date: this.date(),
          }
        : { task_id: this.urgentForm.task_id, scheduled_date: this.date() };
    this.api.urgentTask(body).subscribe({
      next: (tasks) => {
        this.day.set(tasks);
        this.urgentBusy.set(false);
        this.showUrgent.set(false);
        this.toast.success('Urgent task started ⚡');
        this.load();
      },
      error: (e) => {
        this.urgentBusy.set(false);
        this.toast.error(e?.error?.detail ?? 'Could not start urgent task');
      },
    });
  }

  // ── Time helpers ───────────────────────────────────────────────────────────
  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':');
    return (+h || 0) * 60 + (+m || 0);
  }
  private clock(totalMin: number): string {
    const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const ap = h < 12 ? 'AM' : 'PM';
    let hh = h % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${String(m % 60).padStart(2, '0')} ${ap}`;
  }
  private clock24(totalMin: number): string {
    const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  private durationMin(task: Task): number {
    if (task.planned_start && task.planned_end) {
      const d = (new Date(task.planned_end).getTime() - new Date(task.planned_start).getTime()) / 60000;
      if (d > 0) return Math.round(d);
    }
    return task.estimated_minutes || 30;
  }

  // Proof images that failed to load — shown as a graceful placeholder instead.
  broken = signal<Set<string>>(new Set());
  markBroken(id: string): void {
    this.broken.update((s) => new Set(s).add(id));
  }

  doneOf(task: Task): string {
    const pts = task.progress_points ?? [];
    return `${pts.filter((p) => p.done).length}/${pts.length} steps`;
  }

  /** A task that was worked on then paused (has time banked, not running/done). */
  isPaused(task: Task): boolean {
    return (
      task.status !== 'in_progress' &&
      task.status !== 'completed' &&
      (task.accumulated_seconds || 0) > 0
    );
  }
  workedPct(task: Task): number {
    const est = (task.estimated_minutes || 0) * 60;
    if (!est) return 50;
    return Math.min(100, Math.round((this.liveSeconds(task) / est) * 100));
  }
  remainingMin(task: Task): number {
    const est = task.estimated_minutes || 0;
    const doneMin = Math.floor(this.liveSeconds(task) / 60);
    return Math.max(0, est - doneMin);
  }

  liveSeconds(task: Task): number {
    let seconds = task.accumulated_seconds || 0;
    if (task.status === 'in_progress' && task.timer_started_at) {
      const started = new Date(task.timer_started_at).getTime();
      seconds += Math.max(0, Math.floor((this.now() - started) / 1000));
    }
    return seconds;
  }
  liveTime(task: Task): string {
    return formatDuration(this.liveSeconds(task));
  }
  clockFromIso(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return this.clock(d.getHours() * 60 + d.getMinutes());
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  dropInDay(event: CdkDragDrop<Task[]>): void {
    if (event.previousContainer === event.container) {
      const list = [...this.day()];
      moveItemInArray(list, event.previousIndex, event.currentIndex);
      this.day.set(list);
    } else {
      const dayList = [...this.day()];
      const backlogList = [...this.backlog()];
      transferArrayItem(backlogList, dayList, event.previousIndex, event.currentIndex);
      this.day.set(dayList);
      this.backlog.set(backlogList);
    }
    this.persistOrder();
  }

  dropInBacklog(event: CdkDragDrop<Task[]>): void {
    if (event.previousContainer === event.container) return;
    const dayList = [...this.day()];
    const backlogList = [...this.backlog()];
    const task = dayList[event.previousIndex];
    transferArrayItem(dayList, backlogList, event.previousIndex, event.currentIndex);
    this.day.set(dayList);
    this.backlog.set(backlogList);
    this.api.unscheduleTask(task.id).subscribe({
      next: () => this.persistOrder(),
      error: (e) => this.handleErr(e),
    });
  }

  private persistOrder(): void {
    const entries = this.day().map((t, i) => ({ task_id: t.id, order_index: i }));
    if (!entries.length) return;
    this.api.reorder(this.date(), entries).subscribe({
      next: (tasks) => this.day.set(tasks),
      error: (e) => this.handleErr(e),
    });
  }

  sendBack(task: Task): void {
    this.api.unscheduleTask(task.id).subscribe({
      next: () => { this.toast.info('Moved to backlog'); this.load(); },
      error: (e) => this.handleErr(e),
    });
  }

  start(task: Task): void {
    this.api.startTimer(task.id).subscribe({
      next: (t) => { this.replace(t); this.toast.success('Timer started'); },
      error: (e) => this.handleErr(e),
    });
  }
  pause(task: Task): void {
    this.api.pauseTimer(task.id).subscribe({
      next: (t) => this.replace(t),
      error: (e) => this.handleErr(e),
    });
  }
  openComplete(task: Task): void { this.completing.set(task); }
  onCompleted(_: Task): void { this.completing.set(null); this.load(); }

  carryForward(): void {
    this.api.carryForward(this.date()).subscribe({
      next: (moved) => { this.toast.success(`Carried forward ${moved.length} task(s)`); this.load(); },
      error: (e) => this.handleErr(e),
    });
  }

  private replace(task: Task): void {
    this.day.update((list) => list.map((t) => (t.id === task.id ? task : t)));
    if (this.selected()?.id === task.id) this.selected.set(task);
  }
  private handleErr(e: any): void {
    this.toast.error(e?.error?.detail ?? 'Something went wrong');
    this.load();
  }
  cardClass(task: Task): string {
    if (task.status === 'completed') return 'border-emerald-200 bg-emerald-50/40';
    if (task.status === 'in_progress') return 'border-emerald-300 ring-1 ring-emerald-100';
    return 'border-ink-200 hover:border-ink-300';
  }
}
