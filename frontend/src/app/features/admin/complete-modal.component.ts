import { Component, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
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
          <label
            class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition hover:border-ink-400 hover:bg-ink-50"
            [class.border-emerald-400]="dragOver()"
            [class.bg-emerald-50]="dragOver()"
            [class.border-ink-200]="!dragOver()"
            (dragover)="onDragOver($event)"
            (dragleave)="dragOver.set(false)"
            (drop)="onDrop($event)"
          >
            @if (previewUrl()) {
              <img [src]="previewUrl()" alt="preview" class="max-h-40 rounded-lg object-contain" />
              <span class="mt-2 text-xs text-ink-500">Click, paste, or drop to change</span>
            } @else {
              <span class="text-2xl">📷</span>
              <span class="mt-1 text-sm font-medium text-ink-600">Upload, paste, or drop an image</span>
              <span class="text-xs text-ink-400">Click to browse · paste with {{ pasteHint }} · drag &amp; drop · PNG/JPG/WEBP</span>
            }
            <input type="file" accept="image/*" class="hidden" (change)="onFile($event)" />
          </label>
          @if (justPasted()) {
            <p class="mt-1.5 text-center text-xs font-medium text-emerald-600">✓ Image pasted from clipboard</p>
          }
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
  dragOver = signal(false);
  justPasted = signal(false);

  readonly pasteHint = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';

  get tracked(): string {
    return formatDuration(this.task.elapsed_seconds || this.task.accumulated_seconds);
  }

  /** Ctrl/Cmd+V anywhere while the modal is open grabs an image off the clipboard. */
  @HostListener('document:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          event.preventDefault();
          const named = this.named(blob, 'pasted');
          this.setImage(named);
          this.justPasted.set(true);
          this.toast.success('Image pasted');
          return;
        }
      }
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const f = event.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) this.setImage(f);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setImage(input.files?.[0] ?? null);
  }

  /** Single place that updates the chosen image + its preview. */
  private setImage(f: File | null): void {
    this.file = f;
    this.justPasted.set(false);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => this.previewUrl.set(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      this.previewUrl.set(null);
    }
  }

  /** Clipboard blobs are often unnamed — give them a real filename + extension. */
  private named(blob: Blob, base: string): File {
    if (blob instanceof File && blob.name) return blob;
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return new File([blob], `${base}.${ext}`, { type: blob.type || 'image/png' });
  }

  async submit(): Promise<void> {
    if (this.saving()) return; // guard against double-submit
    this.saving.set(true);
    const image = this.file ? await this.compressImage(this.file) : null;
    this.api.completeTask(this.task.id, this.note.trim() || null, image).subscribe({
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

  /** Downscale/recompress large images client-side so uploads are fast. */
  private async compressImage(file: File): Promise<File> {
    // Leave GIFs (animation) and already-small files untouched.
    if (file.type === 'image/gif' || file.size < 400 * 1024) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const maxDim = 1600;
      let { width, height } = bitmap;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
      bitmap.close?.();
      if (!blob || blob.size >= file.size) return file; // keep original if no win
      const base = file.name.replace(/\.\w+$/, '') || 'proof';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } catch {
      return file; // fall back to the raw file on any failure
    }
  }
}
