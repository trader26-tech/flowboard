import { Component, Input, computed, signal } from '@angular/core';

import { Task } from '../core/models';
import { formatDuration, prettyDate, toDateKey } from '../core/time.util';

interface DayCell {
  key: string;         // YYYY-MM-DD (empty string = padding before range start)
  date: Date | null;
  inRange: boolean;
  count: number;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface DayBucket {
  count: number;
  minutes: number;
  tasks: Task[];
}

const LEVEL_CLASS: Record<number, string> = {
  0: 'bg-ink-100',
  1: 'bg-emerald-200',
  2: 'bg-emerald-300',
  3: 'bg-emerald-400',
  4: 'bg-emerald-600',
};

/**
 * GitHub-style contribution heatmap of completed work. Each square is a day; the
 * greener it is, the more tasks were completed that day. Click a day to inspect
 * exactly what was delivered (with proof images + notes).
 */
@Component({
  selector: 'app-contribution-calendar',
  standalone: true,
  template: `
    <div class="card p-4 sm:p-5">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-base font-bold tracking-tight text-ink-900">{{ title }}</h2>
          <p class="text-xs text-ink-500">{{ total() }} task(s) completed in the last 6 months</p>
        </div>
        <div class="flex items-center gap-1.5 text-[11px] text-ink-400">
          Less
          <span class="h-3 w-3 rounded-sm bg-ink-100"></span>
          <span class="h-3 w-3 rounded-sm bg-emerald-200"></span>
          <span class="h-3 w-3 rounded-sm bg-emerald-300"></span>
          <span class="h-3 w-3 rounded-sm bg-emerald-400"></span>
          <span class="h-3 w-3 rounded-sm bg-emerald-600"></span>
          More
        </div>
      </div>

      <!-- Heatmap: scrolls horizontally on small screens -->
      <div class="overflow-x-auto pb-1">
        <div class="flex gap-1">
          @for (week of weeks(); track $index) {
            <div class="flex flex-col gap-1">
              @for (cell of week; track $index) {
                @if (cell.inRange) {
                  <button
                    class="h-3 w-3 rounded-sm ring-offset-1 transition hover:ring-2 hover:ring-ink-300"
                    [class]="levelClass(cell.level)"
                    [class.ring-2]="cell.key === selectedKey()"
                    [class.ring-ink-900]="cell.key === selectedKey()"
                    [title]="tooltip(cell)"
                    (click)="select(cell.key)"
                  ></button>
                } @else {
                  <span class="h-3 w-3"></span>
                }
              }
            </div>
          }
        </div>
      </div>

      <!-- Selected day detail -->
      @if (selectedKey()) {
        <div class="mt-4 border-t border-ink-100 pt-4">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-ink-800">{{ prettyDate(selectedKey()) }}</h3>
            <button class="text-xs text-ink-400 hover:text-ink-700" (click)="select('')">Clear</button>
          </div>
          @if (!selectedTasks().length) {
            <p class="rounded-lg bg-ink-50 px-3 py-4 text-center text-xs text-ink-400">
              No work completed on this day.
            </p>
          } @else {
            <div class="grid gap-3 sm:grid-cols-2">
              @for (t of selectedTasks(); track t.id) {
                <div class="overflow-hidden rounded-lg border border-ink-200 bg-white">
                  @if (t.proof_image_url) {
                    <a [href]="t.proof_image_url" target="_blank" rel="noopener">
                      <img [src]="t.proof_image_url" class="h-28 w-full object-cover" alt="proof" />
                    </a>
                  }
                  <div class="p-3">
                    <div class="flex items-center gap-1.5">
                      @if (showClient && t.client_name) {
                        <span class="h-2 w-2 rounded-full" [style.background]="t.client_color || '#94a3b8'"></span>
                        <span class="truncate text-[11px] font-medium text-ink-500">{{ t.client_name }}</span>
                      }
                      <span class="chip ml-auto bg-emerald-50 text-emerald-700">✓ done</span>
                    </div>
                    <h4 class="mt-1 text-sm font-semibold text-ink-900">{{ t.title }}</h4>
                    @if (t.completion_note) {
                      <p class="mt-1 line-clamp-2 text-xs text-ink-500">{{ t.completion_note }}</p>
                    }
                    <p class="mt-1.5 text-[11px] text-ink-400">Time spent {{ dur(t) }}</p>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <p class="mt-3 text-center text-xs text-ink-400">Click any square to see what was completed that day.</p>
      }
    </div>
  `,
})
export class ContributionCalendarComponent {
  @Input() title = 'Completion activity';
  @Input() showClient = false;
  @Input() set tasks(value: Task[]) {
    this._tasks = value ?? [];
  }
  get tasks(): Task[] {
    return this._tasks;
  }
  private _tasks: Task[] = [];

  prettyDate = prettyDate;
  selectedKey = signal('');

  private readonly weeksBack = 26;

  /** Bucket completed tasks by the local date they were finished. */
  private buckets = computed<Map<string, DayBucket>>(() => {
    const map = new Map<string, DayBucket>();
    for (const t of this.tasks) {
      const iso = t.actual_end || t.updated_at;
      if (!iso || t.status !== 'completed') continue;
      const key = toDateKey(new Date(iso));
      const b = map.get(key) ?? { count: 0, minutes: 0, tasks: [] };
      b.count += 1;
      b.minutes += Math.round((t.accumulated_seconds || 0) / 60);
      b.tasks.push(t);
      map.set(key, b);
    }
    return map;
  });

  total = computed(() => {
    let n = 0;
    for (const b of this.buckets().values()) n += b.count;
    return n;
  });

  weeks = computed<DayCell[][]>(() => {
    const buckets = this.buckets();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start: N weeks back, then rewind to the Sunday that begins that week.
    const start = new Date(today);
    start.setDate(start.getDate() - this.weeksBack * 7);
    start.setDate(start.getDate() - start.getDay());

    const cols: DayCell[][] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const col: DayCell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(cursor);
        const inRange = date <= today && date >= this.rangeStart(today);
        const key = toDateKey(date);
        const b = buckets.get(key);
        const count = b?.count ?? 0;
        col.push({
          key: inRange ? key : '',
          date: inRange ? date : null,
          inRange,
          count,
          minutes: b?.minutes ?? 0,
          level: this.levelFor(count),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(col);
    }
    return cols;
  });

  selectedTasks = computed<Task[]>(() => {
    const key = this.selectedKey();
    if (!key) return [];
    return (this.buckets().get(key)?.tasks ?? [])
      .slice()
      .sort((a, b) => (a.actual_end || '').localeCompare(b.actual_end || ''));
  });

  private rangeStart(today: Date): Date {
    const s = new Date(today);
    s.setDate(s.getDate() - this.weeksBack * 7);
    return s;
  }
  private levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 3;
    return 4;
  }
  levelClass(level: number): string {
    return LEVEL_CLASS[level] ?? LEVEL_CLASS[0];
  }
  tooltip(cell: DayCell): string {
    const when = cell.key ? prettyDate(cell.key) : '';
    if (!cell.count) return `${when} · no work`;
    return `${when} · ${cell.count} task(s) · ${cell.minutes}m`;
  }
  dur(t: Task): string {
    return formatDuration(t.accumulated_seconds || 0);
  }
  select(key: string): void {
    this.selectedKey.set(key);
  }
}
