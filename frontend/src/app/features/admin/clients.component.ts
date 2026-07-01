import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { User } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { contrastText } from '../../core/time.util';

const PALETTE = [
  '#6366f1', '#ec4899', '#f97316', '#10b981', '#0ea5e9',
  '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#64748b',
];

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-bold tracking-tight text-ink-900">Clients</h2>
        <p class="text-sm text-ink-500">Invite clients and pick a colour to identify their work everywhere.</p>
      </div>
      <button class="btn-primary btn-sm" (click)="openCreate()">＋ Invite client</button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      @for (c of clients(); track c.id) {
        <div class="card flex items-center gap-4 p-4">
          <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold"
                [style.background]="c.color" [style.color]="contrast(c.color)">
            {{ initials(c.name) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-ink-900">{{ c.name }}</p>
            <p class="truncate text-sm text-ink-400">{{ c.email }}</p>
            @if (!c.is_active) { <span class="chip mt-1 bg-rose-50 text-rose-600">disabled</span> }
          </div>
          <button class="btn-ghost px-2" (click)="openEdit(c)">✎</button>
        </div>
      }
      @if (!clients().length) {
        <div class="card col-span-full grid place-items-center py-16 text-center text-ink-400">
          <span class="text-3xl">👥</span>
          <p class="mt-2 text-sm">No clients yet. Invite your first one.</p>
        </div>
      }
    </div>

    @if (editing()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 animate-fade-in" (click)="close()">
        <div class="card w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-bold text-ink-900">{{ isNew() ? 'Invite client' : 'Edit client' }}</h3>

          <div class="mt-5 space-y-4">
            <div>
              <label class="label">Name</label>
              <input class="input" [(ngModel)]="draft.name" placeholder="Acme Corp" />
            </div>
            @if (isNew()) {
              <div>
                <label class="label">Email</label>
                <input class="input" type="email" [(ngModel)]="draft.email" placeholder="client@acme.com" />
              </div>
            }
            <div>
              <label class="label">{{ isNew() ? 'Password' : 'Reset password (optional)' }}</label>
              <input class="input" type="text" [(ngModel)]="draft.password" placeholder="At least 6 characters" />
            </div>
            <div>
              <label class="label">Colour</label>
              <div class="flex flex-wrap gap-2">
                @for (color of palette; track color) {
                  <button type="button"
                          class="h-8 w-8 rounded-full ring-offset-2 transition"
                          [style.background]="color"
                          [class.ring-2]="draft.color === color"
                          [class.ring-ink-900]="draft.color === color"
                          (click)="draft.color = color"></button>
                }
                <input type="color" class="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0" [(ngModel)]="draft.color" />
              </div>
            </div>
            @if (!isNew()) {
              <label class="flex items-center gap-2 text-sm text-ink-600">
                <input type="checkbox" [(ngModel)]="draft.is_active" /> Active
              </label>
            }
          </div>

          <div class="mt-6 flex justify-between">
            @if (!isNew()) {
              <button class="btn-danger" (click)="remove()">Delete</button>
            } @else { <span></span> }
            <div class="flex gap-2">
              <button class="btn-outline" (click)="close()">Cancel</button>
              <button class="btn-primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClientsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  clients = signal<User[]>([]);
  editing = signal(false);
  isNew = signal(false);
  saving = signal(false);
  palette = PALETTE;

  draft: any = {};
  private editId: string | null = null;

  contrast = contrastText;

  ngOnInit(): void {
    this.load();
  }
  load(): void {
    this.api.listClients().subscribe((c) => this.clients.set(c));
  }

  openCreate(): void {
    this.isNew.set(true);
    this.editId = null;
    this.draft = { name: '', email: '', password: '', color: PALETTE[this.clients().length % PALETTE.length] };
    this.editing.set(true);
  }
  openEdit(c: User): void {
    this.isNew.set(false);
    this.editId = c.id;
    this.draft = { name: c.name, password: '', color: c.color, is_active: c.is_active };
    this.editing.set(true);
  }
  close(): void {
    this.editing.set(false);
  }

  save(): void {
    this.saving.set(true);
    if (this.isNew()) {
      this.api
        .createClient({
          email: this.draft.email.trim().toLowerCase(),
          name: this.draft.name.trim(),
          password: this.draft.password,
          color: this.draft.color,
        })
        .subscribe({
          next: () => this.done('Client invited'),
          error: (e) => this.fail(e),
        });
    } else if (this.editId) {
      const body: any = { name: this.draft.name, color: this.draft.color, is_active: this.draft.is_active };
      if (this.draft.password) body.password = this.draft.password;
      this.api.updateClient(this.editId, body).subscribe({
        next: () => this.done('Client updated'),
        error: (e) => this.fail(e),
      });
    }
  }

  remove(): void {
    if (!this.editId) return;
    this.api.deleteClient(this.editId).subscribe({
      next: () => this.done('Client deleted'),
      error: (e) => this.fail(e),
    });
  }

  private done(msg: string): void {
    this.saving.set(false);
    this.toast.success(msg);
    this.close();
    this.load();
  }
  private fail(e: any): void {
    this.saving.set(false);
    this.toast.error(e?.error?.detail ?? 'Something went wrong');
  }

  initials(name: string): string {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }
}
