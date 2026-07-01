import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { ClientsComponent } from './clients.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, ClientsComponent],
  template: `
    <div class="mb-6">
      <h1 class="text-xl font-bold tracking-tight text-ink-900">Settings</h1>
      <p class="text-sm text-ink-500">Your working day and the clients you serve, all in one place.</p>
    </div>

    <!-- Working day -->
    <section class="mb-8">
      <h2 class="mb-3 text-base font-bold tracking-tight text-ink-900">Working day</h2>
      <div class="card max-w-lg p-6">
        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label class="label" for="start">Workday start</label>
            <input id="start" type="time" class="input" [(ngModel)]="start" />
          </div>
          <div>
            <label class="label" for="hours">Workday length (hours)</label>
            <input id="hours" type="number" min="1" max="24" class="input" [(ngModel)]="hours" />
          </div>
        </div>
        <p class="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
          Your timeline starts at <b>{{ start }}</b> and targets <b>{{ hours }}h</b>. Tasks reflow from
          this anchor — finishing early prepones the rest, finishing late postpones it.
        </p>
        <div class="mt-6 flex justify-end">
          <button class="btn-primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save settings' }}</button>
        </div>
      </div>
    </section>

    <div class="mb-8 border-t border-ink-100"></div>

    <!-- Clients -->
    <section>
      <app-clients />
    </section>
  `,
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  start = '09:00';
  hours = 10;
  saving = signal(false);

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) => {
      this.start = (s.workday_start ?? '09:00:00').slice(0, 5);
      this.hours = s.workday_hours;
    });
  }

  save(): void {
    this.saving.set(true);
    this.api
      .updateSettings({ workday_start: `${this.start}:00`, workday_hours: Number(this.hours) })
      .subscribe({
        next: () => { this.saving.set(false); this.toast.success('Settings saved'); },
        error: (e) => { this.saving.set(false); this.toast.error(e?.error?.detail ?? 'Could not save'); },
      });
  }
}
