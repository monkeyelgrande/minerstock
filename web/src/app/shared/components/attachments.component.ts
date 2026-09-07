import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';

import { PurchasingApi } from '../../core/api/purchasing-api.service';
import { AttachableType, Attachment } from '../../core/models/purchasing.model';
import { ToastService } from '../../core/services/toast.service';

/**
 * Lista de adjuntos de un documento con zona de carga.
 * <app-attachments type="quotation" [documentId]="q.id" [items]="q.attachments" [canEdit]="true" (changed)="reload()" />
 */
@Component({
  selector: 'app-attachments',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-header">
        <span class="card-title">{{ title() }}</span>
        @if (items().length) {
          <span class="text-xs text-ink-3">{{ items().length }} archivo(s)</span>
        }
      </div>
      <div class="card-body space-y-3">
        @if (canEdit()) {
          <label
            class="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg px-4 py-5 cursor-pointer transition-colors"
            [class.border-line-strong]="!dragging()"
            [class.border-brand]="dragging()"
            [class.bg-amber-50/40]="dragging()"
            (dragover)="$event.preventDefault(); dragging.set(true)"
            (dragleave)="dragging.set(false)"
            (drop)="onDrop($event)"
          >
            <span class="material-symbols-outlined text-ink-3">{{ uploading() ? 'progress_activity' : 'upload_file' }}</span>
            <span class="text-sm text-ink-2">{{ uploading() ? 'Subiendo…' : hint() }}</span>
            <span class="text-xs text-ink-3">Imágenes, PDF, Excel o Word · máx. 10 MB</span>
            <input type="file" class="hidden" [multiple]="true" accept="image/*,.pdf,.xlsx,.xls,.docx" (change)="onPick($event)" [disabled]="uploading()" />
          </label>
        }

        @if (!items().length) {
          <p class="text-sm text-ink-3 text-center py-2">Sin adjuntos.</p>
        } @else {
          <ul class="divide-y divide-line">
            @for (a of items(); track a.id) {
              <li class="flex items-center gap-3 py-2">
                @if (a.is_image) {
                  <a [href]="a.url" target="_blank" class="shrink-0">
                    <img [src]="a.url" [alt]="a.original_name" class="w-12 h-12 rounded object-cover border border-line" />
                  </a>
                } @else {
                  <div class="w-12 h-12 rounded bg-canvas border border-line flex items-center justify-center text-ink-3 shrink-0">
                    <span class="material-symbols-outlined">{{ a.mime?.includes('pdf') ? 'picture_as_pdf' : 'description' }}</span>
                  </div>
                }
                <div class="min-w-0 flex-1">
                  <a [href]="a.url" target="_blank" class="text-sm font-medium text-link hover:underline truncate block">{{ a.original_name }}</a>
                  <div class="text-xs text-ink-3">
                    {{ size(a.size) }}
                    @if (a.uploaded_by) { · {{ a.uploaded_by.name }} }
                    @if (a.purpose) { · <span class="chip chip-draft !h-5">{{ a.purpose }}</span> }
                  </div>
                </div>
                @if (canEdit()) {
                  <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" size="small" (onClick)="remove(a)" />
                }
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `,
})
export class AttachmentsComponent {
  private readonly api = inject(PurchasingApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);

  readonly type = input.required<AttachableType>();
  readonly documentId = input.required<number>();
  readonly items = input<Attachment[]>([]);
  readonly canEdit = input(false);
  readonly purpose = input<string | undefined>(undefined);
  readonly title = input('Adjuntos');
  readonly hint = input('Arrastra archivos o haz clic para seleccionar');
  readonly changed = output<void>();

  readonly uploading = signal(false);
  readonly dragging = signal(false);

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) void this.upload(Array.from(input.files));
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (event.dataTransfer?.files.length) void this.upload(Array.from(event.dataTransfer.files));
  }

  private async upload(files: File[]): Promise<void> {
    this.uploading.set(true);
    let ok = 0;
    for (const file of files) {
      await new Promise<void>((resolve) => {
        this.api.uploadAttachment(this.type(), this.documentId(), file, this.purpose()).subscribe({
          next: () => {
            ok++;
            resolve();
          },
          error: (err: unknown) => {
            const msg = (err as { error?: { message?: string } })?.error?.message;
            this.toast.error(`No se pudo subir ${file.name}`, msg);
            resolve();
          },
        });
      });
    }
    this.uploading.set(false);
    if (ok) {
      this.toast.success(ok === 1 ? 'Archivo adjuntado.' : `${ok} archivos adjuntados.`);
      this.changed.emit();
    }
  }

  remove(a: Attachment): void {
    this.confirm.confirm({
      header: 'Eliminar adjunto',
      message: `¿Eliminar "${a.original_name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.api.deleteAttachment(a.id).subscribe(() => {
          this.toast.success('Adjunto eliminado.');
          this.changed.emit();
        });
      },
    });
  }

  size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
