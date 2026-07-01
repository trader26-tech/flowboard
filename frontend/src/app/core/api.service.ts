import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AppSettings,
  ClientStats,
  ProgressPoint,
  ScheduleEntry,
  Task,
  TaskStatus,
  User,
} from './models';

const BASE = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // ── Clients (admin) ──────────────────────────────────────────────────────
  listClients(): Observable<User[]> {
    return this.http.get<User[]>(`${BASE}/clients`);
  }
  createClient(body: {
    email: string;
    name: string;
    password: string;
    color: string;
  }): Observable<User> {
    return this.http.post<User>(`${BASE}/clients`, body);
  }
  updateClient(id: string, body: Partial<User> & { password?: string }): Observable<User> {
    return this.http.patch<User>(`${BASE}/clients/${id}`, body);
  }
  deleteClient(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/clients/${id}`);
  }

  // ── Tasks ────────────────────────────────────────────────────────────────
  listTasks(opts: { status?: TaskStatus; clientId?: string } = {}): Observable<Task[]> {
    let params = new HttpParams();
    if (opts.status) params = params.set('status', opts.status);
    if (opts.clientId) params = params.set('client_id', opts.clientId);
    return this.http.get<Task[]>(`${BASE}/tasks`, { params });
  }
  backlog(): Observable<Task[]> {
    return this.http.get<Task[]>(`${BASE}/tasks/backlog`);
  }
  myTasks(): Observable<Task[]> {
    return this.http.get<Task[]>(`${BASE}/tasks/mine`);
  }
  daySchedule(date: string): Observable<Task[]> {
    return this.http.get<Task[]>(`${BASE}/tasks/schedule`, {
      params: new HttpParams().set('date', date),
    });
  }
  overdue(before: string): Observable<Task[]> {
    return this.http.get<Task[]>(`${BASE}/tasks/overdue`, {
      params: new HttpParams().set('before', before),
    });
  }
  createTask(body: {
    title: string;
    description?: string | null;
    estimated_minutes?: number | null;
    client_id?: string;
  }): Observable<Task> {
    return this.http.post<Task>(`${BASE}/tasks`, body);
  }
  updateTask(
    id: string,
    body: { title?: string; description?: string | null; estimated_minutes?: number | null },
  ): Observable<Task> {
    return this.http.patch<Task>(`${BASE}/tasks/${id}`, body);
  }
  deleteTask(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/tasks/${id}`);
  }
  setProgress(id: string, points: ProgressPoint[]): Observable<Task> {
    return this.http.patch<Task>(`${BASE}/tasks/${id}/progress`, { progress_points: points });
  }
  scheduleTask(id: string, date: string, orderIndex?: number): Observable<Task> {
    return this.http.post<Task>(`${BASE}/tasks/${id}/schedule`, {
      scheduled_date: date,
      order_index: orderIndex ?? null,
    });
  }
  unscheduleTask(id: string): Observable<Task> {
    return this.http.post<Task>(`${BASE}/tasks/${id}/unschedule`, {});
  }
  reorder(date: string, entries: ScheduleEntry[]): Observable<Task[]> {
    return this.http.post<Task[]>(`${BASE}/tasks/reorder`, {
      scheduled_date: date,
      entries,
    });
  }
  urgentTask(body: {
    task_id?: string;
    title?: string;
    description?: string | null;
    estimated_minutes?: number | null;
    client_id?: string | null;
    scheduled_date?: string;
  }): Observable<Task[]> {
    return this.http.post<Task[]>(`${BASE}/tasks/urgent`, body);
  }
  carryForward(targetDate: string, taskIds?: string[]): Observable<Task[]> {
    return this.http.post<Task[]>(`${BASE}/tasks/carry-forward`, {
      target_date: targetDate,
      task_ids: taskIds ?? null,
    });
  }
  startTimer(id: string): Observable<Task> {
    return this.http.post<Task>(`${BASE}/tasks/${id}/start`, {});
  }
  pauseTimer(id: string): Observable<Task> {
    return this.http.post<Task>(`${BASE}/tasks/${id}/pause`, {});
  }
  completeTask(id: string, note: string | null, image: File | null): Observable<Task> {
    const form = new FormData();
    if (note) form.append('note', note);
    if (image) form.append('image', image);
    return this.http.post<Task>(`${BASE}/tasks/${id}/complete`, form);
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  getSettings(): Observable<AppSettings> {
    return this.http.get<AppSettings>(`${BASE}/settings`);
  }
  updateSettings(body: Partial<AppSettings>): Observable<AppSettings> {
    return this.http.patch<AppSettings>(`${BASE}/settings`, body);
  }
  setPresence(online: boolean): Observable<AppSettings> {
    return this.http.post<AppSettings>(`${BASE}/settings/presence`, { online });
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  clientStats(): Observable<ClientStats[]> {
    return this.http.get<ClientStats[]>(`${BASE}/stats/clients`);
  }
  myStats(): Observable<ClientStats> {
    return this.http.get<ClientStats>(`${BASE}/stats/me`);
  }
}
