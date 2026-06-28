import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../core/api.service';
import { Task } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { formatDuration } from '../../core/time.util';

@Component({
  selector: 'app-complete-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 animate-fade-in"
         (click)="cancel.emit()">
      <div class="card w-full max-w-md p-6" (click)="$event.stopPropagation()">
        <h3 class="text-lg font-bold text-ink-900">Complete task</h3>
        <p class="mt-1 text-sm text-ink-500">"{{ task.title }}"</p>

        <div class="mt-3 flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
          <span>⏱</span> Time tracked:
          <span class="font-semibold text-ink-800">{{ tracked }}</span>
        </div>

        <div class="mt-5">
          <label class="label">Proof image</label>
          <label class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-200 px-4 py-6 text-center transition hover:border-ink-400 hover:bg-ink-50">
            @if (previewUrl()) {
              <img [src]="previewUrl()" alt="preview" class="max-h-40 rounded-lg object-contain" />
              <span class="mt-2 text-xs text-ink-500">Click to change</span>
            } @else {
              <span class="text-2xl">📷</span>
              <span class="mt-1 text-sm font-medium text-ink-600">Upload a screenshot or photo</span>
              <span class="text-xs text-ink-400">PNG, JPG, WEBP up to 10MB</span>
            }
            <input type="file" accept="image/*" class="hidden" (change)="onFile($event)" />
          </label>
        </div>

        <div class="mt-4">
          <label class="label" for="note">Completion note (optional)</label>
          <textarea id="note" class="input min-h-[80px]" [(ngModel)]="note"
                    placeholder="What was delivered?"></textarea>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button class="btn-outline" (click)="cancel.emit()" [disabled]="saving()">Cancel</button>
          <button class="btn-success" (click)="submit()" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Mark complete' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CompleteModalComponent {
  @Input({ required: true }) task!: Task;
  @Output() cancel = new EventEmitter<void>();
  @Output() completed = new EventEmitter<Task>();

  private api = inject(ApiService);
  private toast = inject(ToastService);

  note = '';
  file: File | null = null;
  previewUrl = signal<string | null>(null);
  saving = signal(false);

  get tracked(): string {
    return formatDuration(this.task.elapsed_seconds || this.task.accumulated_seconds);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.file = f;
    if (f) {
      const reader = new FileReader();
      reader.onload = () => this.previewUrl.set(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      this.previewUrl.set(null);
    }
  }

  submit(): void {
    this.saving.set(true);
    this.api.completeTask(this.task.id, this.note.trim() || null, this.file).subscribe({
      next: (t) => {
        this.saving.set(false);
        this.toast.success('Task completed 🎉');
        this.completed.emit(t);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.detail ?? 'Could not complete task');
      },
    });
  }
}
