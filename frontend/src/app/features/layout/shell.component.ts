import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { contrastText } from '../../core/time.util';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-full bg-ink-50/40">
      <!-- Sidebar -->
      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-ink-200 bg-white transition-transform lg:static lg:translate-x-0"
        [class.-translate-x-full]="!menuOpen()"
      >
        <div class="flex h-14 items-center gap-2.5 px-5 text-[15px] font-bold tracking-tight text-ink-900">
          <span class="grid h-7 w-7 place-items-center rounded-md bg-ink-900 text-xs text-white">FB</span>
          FlowBoard
        </div>
        <div class="mx-3 border-t border-ink-100"></div>

        <nav class="flex-1 space-y-0.5 px-3 py-3">
          <p class="px-3 pb-2 pt-1 section-title">{{ isAdmin() ? 'Workspace' : 'Portal' }}</p>
          @for (item of nav(); track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-ink-100 !text-ink-900 font-semibold"
              [routerLinkActiveOptions]="{ exact: false }"
              (click)="menuOpen.set(false)"
              class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-50"
            >
              <span class="w-4 text-center text-[13px] text-ink-400">{{ item.icon }}</span>
              {{ item.label }}
            </a>
          }
        </nav>

        <div class="border-t border-ink-100 p-3">
          <div class="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <span
              class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
              [style.background]="user()?.color"
              [style.color]="textColor()"
            >{{ initials() }}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-ink-800">{{ user()?.name }}</p>
              <p class="truncate text-xs capitalize text-ink-400">{{ user()?.role }}</p>
            </div>
            <button class="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                    title="Sign out" (click)="logout()">⎋</button>
          </div>
        </div>
      </aside>

      @if (menuOpen()) {
        <div class="fixed inset-0 z-30 bg-ink-900/20 lg:hidden" (click)="menuOpen.set(false)"></div>
      }

      <!-- Main -->
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur lg:px-7">
          <button class="btn-ghost px-2 lg:hidden" (click)="menuOpen.set(true)">☰</button>
          <div class="flex-1"></div>
          <span class="chip border border-ink-200 bg-white text-ink-500">
            {{ isAdmin() ? 'Admin' : 'Client' }}
          </span>
        </header>
        <main class="flex-1 px-4 py-6 lg:px-7 lg:py-7">
          <div class="mx-auto max-w-7xl">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  user = this.auth.user;
  isAdmin = this.auth.isAdmin;
  menuOpen = signal(false);

  private adminNav: NavItem[] = [
    { label: 'Schedule', path: '/app/schedule', icon: '▦' },
    { label: 'Backlog', path: '/app/backlog', icon: '☰' },
    { label: 'Clients', path: '/app/clients', icon: '◍' },
    { label: 'Dashboard', path: '/app/dashboard', icon: '▤' },
    { label: 'Settings', path: '/app/settings', icon: '⚙' },
  ];
  private clientNav: NavItem[] = [
    { label: 'Overview', path: '/portal/overview', icon: '▤' },
    { label: 'New request', path: '/portal/new', icon: '＋' },
    { label: 'My requests', path: '/portal/tasks', icon: '☰' },
  ];

  nav = computed(() => (this.isAdmin() ? this.adminNav : this.clientNav));

  initials = computed(() => {
    const n = this.user()?.name ?? '?';
    return n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  });
  textColor = computed(() => contrastText(this.user()?.color ?? '#6366f1'));

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
