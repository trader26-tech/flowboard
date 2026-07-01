export type Role = 'admin' | 'client';

export type TaskStatus =
  | 'requested'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ProgressPoint {
  id: string;
  label: string;
  done: boolean;
  done_at?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  client_id: string;
  estimated_minutes: number | null;
  status: TaskStatus;
  scheduled_date: string | null;
  order_index: number;
  timer_started_at: string | null;
  accumulated_seconds: number;
  actual_start: string | null;
  actual_end: string | null;
  proof_image_url: string | null;
  completion_note: string | null;
  progress_points: ProgressPoint[];
  created_at: string;
  updated_at: string;
  client_name: string | null;
  client_color: string | null;
  elapsed_seconds: number;
  progress_percent: number;
  planned_start: string | null;
  planned_end: string | null;
}

export interface ClientStats {
  client_id: string;
  client_name: string;
  client_color: string;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  pending_tasks: number;
  completion_rate: number;
  estimated_minutes_total: number;
  actual_minutes_total: number;
}

export interface AppSettings {
  workday_start: string; // "HH:MM:SS"
  workday_hours: number;
  admin_online: boolean;
  admin_online_since?: string | null;
}

export interface ScheduleEntry {
  task_id: string;
  order_index: number;
}
