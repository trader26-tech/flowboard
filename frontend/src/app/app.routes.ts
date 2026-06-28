import { Routes } from '@angular/router';

import { adminGuard, authGuard, clientGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'schedule' },
      {
        path: 'schedule',
        loadComponent: () =>
          import('./features/admin/schedule.component').then((m) => m.ScheduleComponent),
      },
      {
        path: 'backlog',
        loadComponent: () =>
          import('./features/admin/backlog.component').then((m) => m.BacklogComponent),
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./features/admin/clients.component').then((m) => m.ClientsComponent),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/admin/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  {
    path: 'portal',
    canActivate: [authGuard, clientGuard],
    loadComponent: () => import('./features/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./features/client/client-dashboard.component').then(
            (m) => m.ClientDashboardComponent,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/client/new-request.component').then((m) => m.NewRequestComponent),
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./features/client/my-tasks.component').then((m) => m.MyTasksComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
