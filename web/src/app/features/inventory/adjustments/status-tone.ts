import { ChipTone } from '../../../shared/components/status-chip.component';

/** Tono del chip para los estados de documento simple (borrador / confirmado / anulado). */
export function simpleStatusTone(status: string): ChipTone {
  switch (status) {
    case 'confirmado':
      return 'success';
    case 'anulado':
      return 'danger';
    default:
      return 'draft';
  }
}

/** Tono del chip para los estados de conteo físico (en_proceso / cerrado / anulado). */
export function countStatusTone(status: string): ChipTone {
  switch (status) {
    case 'en_proceso':
      return 'pending';
    case 'cerrado':
      return 'success';
    case 'anulado':
      return 'danger';
    default:
      return 'draft';
  }
}
