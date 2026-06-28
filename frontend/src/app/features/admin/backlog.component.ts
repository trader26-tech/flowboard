import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { Task, User } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { formatMinutes, todayKey } from '../../core/time.util';

@Component({
  selector: 'app-backlog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-ink-900">Backlog</h1>
        <p class="text-sm text-ink-500">Unscheduled requests from your clients. Pick them up into a day.</p>
      </div>
      <button class="btn-primary" (click)="showForm.set(!showForm())">＋ New task</button>
    </div>

    @if (showForm()) {
      <div class="card mb-6 p-5 animate-fade-in">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-400">Create task for a client</h2>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="label">Client</label>
            <select class="input" [(ngModel)]="form.client_id">
              <option value="" disabled>Select a client…</option>
              @for (c of clients(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Estimated minutes (optional)</label>
            <input type="number" min="0" class="input" [(ngModel)]="form.estimated_minutes" placeholder="e.g. 60" />
          </div>
          <div class="md:col-span-2">
            <label class="label">Title</label>
            <input class="input" [(ngModel)]="form.title" placeholder="What needs doing?" />
          </div>
          <div class="md:col-span-2">
            <label class="label">Description (optional)</label>
            <textarea class="input min-h-[70px]" [(ngModel)]="form.description"></textarea>
          </div>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-outline" (click)="showForm.set(false)">Cancel</button>
          <button class="btn-primary" (click)="create()" [disabled]="!form.title || !form.client_id">Create</button>
        </div>
      </div>
    }

    @if (loading()) {
      <p class="text-sm text-ink-400">Loading…</p>
    } @else if (!tasks().length) {
      <div class="card grid place-items-center py-16 text-center text-ink-400">
        <span class="text-3xl">🎉</span>
        <p class="mt-2 text-sm">Backlog is empty — every request is scheduled.</p>
      </div>
    } @else {
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        @for (task of tasks(); track task.id) {
          <div class="card flex flex-col p-4" [style.borderLeftColor]="task.client_color" style="border-left-width:4px">
            <span class="chip self-start" [style.background]="tint(task.client_color)" [style.color]="task.client_color">
              {{ task.client_name }}
            </span>
            <h3 class="mt-2 font-semibold text-ink-900">{{ task.title }}</h3>
            @if (task.description) { <p class="mt-1 line-clamp-3 text-sm text-ink-500">{{ task.description }}</p> }
            <p class="mt-2 text-xs text-ink-400">⏳ Est {{ formatMinutes(task.estimated_minutes) }}</p>
            <div class="mt-4 flex gap-2 border-t border-ink-100 pt-3">
              <button class="btn-sm btn-primary flex-1" (click)="scheduleToday(task)">Schedule today</button>
              <button class="btn-sm btn-danger" (click)="remove(task)">Delete</button>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class BacklogComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  tasks = signal<Task[]>([]);
  clients = signal<User[]>([]);
  loading = signal(true);
  showForm = signal(false);
  formatMinutes = formatMinutes;

  form = { title: '', description: '', estimated_minutes: null as number | null, client_id: '' };

  ngOnInit(): void {
    this.load();
    this.api.listClients().subscribe((c) => this.clients.set(c));
  }

  load(): void {
    this.loading.set(true);
    this.api.backlog().subscribe({
      next: (t) => { this.tasks.set(t); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  create(): void {
    this.api
      .createTask({
        title: this.form.title.trim(),
        description: this.form.description.trim() || null,
        estimated_minutes: this.form.estimated_minutes,
        client_id: this.form.client_id,
      })
      .subscribe({
        next: () => {
          this.toast.success('Task created');
          this.form = { title: '', description: '', estimated_minutes: null, client_id: '' };
          this.showForm.set(false);
          this.load();
        },
        error: (e) => this.toast.error(e?.error?.detail ?? 'Could not create task'),
      });
  }

  scheduleToday(task: Task): void {
    this.api.scheduleTask(task.id, todayKey()).subscribe({
      next: () => { this.toast.success('Added to today'); this.load(); },
      error: (e) => this.toast.error(e?.error?.detail ?? 'Could not schedule'),
    });
  }

  remove(task: Task): void {
    this.api.deleteTask(task.id).subscribe({
      next: () => { this.toast.info('Task deleted'); this.load(); },
      error: (e) => this.toast.error(e?.error?.detail ?? 'Could not delete'),
    });
  }

  tint(hex: string | null): string {
    return (hex || '#6366f1') + '1f';
  }
}
