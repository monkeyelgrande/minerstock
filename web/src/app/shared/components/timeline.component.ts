import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface TimelineEvent {
  title: string;
  at: string | null;
  by?: string | null;
  note?: string | null;
  tone?: 'draft' | 'pending' | 'success' | 'partial' | 'danger' | 'info';
}

/** Línea de tiempo vertical de estados de un documento. */
@Component({
  selector: 'app-timeline',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="relative border-l border-line ml-2 space-y-4">
      @for (e of events(); track $index) {
        <li class="ml-4">
          <span
            class="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white"
            [class.bg-slate-400]="!e.tone || e.tone === 'draft'"
            [class.bg-blue-500]="e.tone === 'pending'"
            [class.bg-emerald-500]="e.tone === 'success'"
            [class.bg-orange-500]="e.tone === 'partial'"
            [class.bg-red-500]="e.tone === 'danger'"
            [class.bg-violet-500]="e.tone === 'info'"
          ></span>
          <div class="text-sm font-medium text-ink">{{ e.title }}</div>
          <div class="text-xs text-ink-3">
            @if (e.by) { {{ e.by }} · }
            {{ e.at ? (e.at | date: 'd MMM y, HH:mm') : '—' }}
          </div>
          @if (e.note) {
            <div class="text-xs text-ink-2 mt-1 italic">“{{ e.note }}”</div>
          }
        </li>
      } @empty {
        <li class="ml-4 text-sm text-ink-3">Sin eventos.</li>
      }
    </ol>
  `,
})
export class TimelineComponent {
  readonly events = input<TimelineEvent[]>([]);
}
