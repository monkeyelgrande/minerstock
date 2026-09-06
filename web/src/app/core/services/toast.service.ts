import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

/** Notificaciones tipo toast (envuelve MessageService de PrimeNG). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messages = inject(MessageService);

  success(summary: string, detail?: string): void {
    this.messages.add({ severity: 'success', summary, detail, life: 3500 });
  }

  info(summary: string, detail?: string): void {
    this.messages.add({ severity: 'info', summary, detail, life: 4000 });
  }

  warn(summary: string, detail?: string): void {
    this.messages.add({ severity: 'warn', summary, detail, life: 5000 });
  }

  error(summary: string, detail?: string): void {
    this.messages.add({ severity: 'error', summary, detail, life: 6000 });
  }
}
