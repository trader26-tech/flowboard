import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex min-h-full">
      <!-- Feature panel -->
      <div class="hidden w-1/2 flex-col justify-between border-r border-ink-200 bg-ink-50/50 p-12 lg:flex">
        <div class="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-ink-900">
          <span class="grid h-7 w-7 place-items-center rounded-md bg-ink-900 text-xs text-white">FB</span>
          FlowBoard
        </div>
        <div>
          <h1 class="max-w-md text-3xl font-extrabold leading-tight tracking-tight text-ink-900">
            Turn client requests into a focused day.
          </h1>
          <p class="mt-3 max-w-md text-sm leading-relaxed text-ink-500">
            Collect work from every client, drag tasks onto a time-blocked schedule, run live
            timers, and ship proof of completion — all in one clean workspace.
          </p>
          <ul class="mt-8 space-y-3 text-sm text-ink-600">
            <li class="flex items-center gap-2.5"><span class="text-ink-900">✓</span> A real timeline that starts when you do</li>
            <li class="flex items-center gap-2.5"><span class="text-ink-900">✓</span> Auto prepone / postpone as you finish</li>
            <li class="flex items-center gap-2.5"><span class="text-ink-900">✓</span> Colour-coded clients &amp; carry-forward</li>
          </ul>
        </div>
        <p class="text-xs text-ink-400">© FlowBoard</p>
      </div>

      <!-- Form panel -->
      <div class="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div class="w-full max-w-sm">
          <div class="mb-8 flex items-center gap-2.5 text-[15px] font-bold text-ink-900 lg:hidden">
            <span class="grid h-7 w-7 place-items-center rounded-md bg-ink-900 text-xs text-white">FB</span>
            FlowBoard
          </div>
          <h2 class="text-xl font-bold tracking-tight text-ink-900">Sign in</h2>
          <p class="mt-1 text-sm text-ink-500">Welcome back. Enter your details to continue.</p>

          <form class="mt-7 space-y-4" (ngSubmit)="submit()">
            <div>
              <label class="label" for="email">Email</label>
              <input id="email" name="email" type="email" class="input" [(ngModel)]="email"
                     autocomplete="username" placeholder="you@company.com" required />
            </div>
            <div>
              <label class="label" for="password">Password</label>
              <input id="password" name="password" type="password" class="input" [(ngModel)]="password"
                     autocomplete="current-password" placeholder="••••••••" required />
            </div>
            @if (error()) {
              <p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error() }}</p>
            }
            <button type="submit" class="btn-primary w-full" [disabled]="loading()">
              {{ loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  submit(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.email.trim().toLowerCase(), this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.toast.success(`Welcome, ${res.user.name}`);
        this.router.navigate([res.user.role === 'admin' ? '/app' : '/portal']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.detail ?? 'Unable to sign in. Check your credentials.');
      },
    });
  }
}
