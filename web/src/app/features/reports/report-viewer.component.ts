import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';

import { CatalogApi } from '../../core/api/catalog-api.service';
import { ReportsApi } from '../../core/api/reports-api.service';
import { CostCenter, Product, ProductCategory, Recipient, Supplier } from '../../core/models/catalog.model';
import { ReportCatalog, ReportColumnType, ReportDef, ReportFilterName, ReportResult } from '../../core/models/reports.model';
import { ToastService } from '../../core/services/toast.service';
import { WarehouseContext } from '../../core/services/warehouse-context.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ProductPickerComponent } from '../../shared/components/product-picker.component';

interface Option {
  label: string;
  value: string;
}

/** Totales que son cantidades (el resto se formatea como moneda COP). */
const QTY_TOTALS = new Set(['entrada', 'salida']);

/**
 * Visor genérico de reportes: renderiza los filtros que declara el reporte (`:key`),
 * la tabla con columnas dinámicas tipadas y la exportación a Excel/PDF.
 */
@Component({
  selector: 'app-report-viewer',
  imports: [
    CurrencyPipe, DecimalPipe, FormsModule, TableModule, ButtonModule, SelectModule, DatePickerModule,
    PageHeaderComponent, ProductPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-viewer.component.html',
})
export class ReportViewerComponent {
  private readonly reports = inject(ReportsApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly currency = new CurrencyPipe('es-CO');
  readonly ctx = inject(WarehouseContext);

  /** Clave del reporte, enlazada desde la ruta `/reportes/:key`. */
  readonly key = input.required<string>();

  // ---------- Catálogo y definición ----------
  readonly catalog = signal<ReportCatalog | null>(null);
  readonly def = signal<ReportDef | null>(null);

  // ---------- Formulario de filtros ----------
  readonly warehouseId = signal<number | null>(null);
  readonly product = signal<Product | null>(null);
  readonly categoryId = signal<number | null>(null);
  readonly supplierId = signal<number | null>(null);
  readonly recipientId = signal<number | null>(null);
  readonly costCenterId = signal<number | null>(null);
  readonly movementType = signal<string | null>(null);
  readonly noveltyType = signal<string | null>(null);
  readonly noveltyStatus = signal<string | null>(null);
  readonly priority = signal<string | null>(null);
  readonly dateFrom = signal<Date | null>(null);
  readonly dateTo = signal<Date | null>(null);

  // ---------- Opciones de selects ----------
  readonly categories = signal<ProductCategory[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly recipients = signal<Recipient[]>([]);
  readonly costCenters = signal<CostCenter[]>([]);
  readonly movementTypes = computed(() => this.catalog()?.movement_types ?? []);
  private readonly requested = new Set<ReportFilterName>();

  readonly noveltyTypeOptions: Option[] = [
    { label: 'Faltante', value: 'faltante' },
    { label: 'Dañado', value: 'dañado' },
    { label: 'Sobrante', value: 'sobrante' },
  ];
  readonly noveltyStatusOptions: Option[] = [
    { label: 'Abierta', value: 'abierta' },
    { label: 'Resuelta', value: 'resuelta' },
  ];
  readonly priorityOptions: Option[] = [
    { label: 'Baja', value: 'baja' },
    { label: 'Normal', value: 'normal' },
    { label: 'Alta', value: 'alta' },
    { label: 'Urgente', value: 'urgente' },
  ];

  // ---------- Resultado ----------
  readonly result = signal<ReportResult | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal<'xlsx' | 'pdf' | null>(null);
  /** Filtros aplicados en la última consulta (los mismos que usa la exportación). */
  private readonly applied = signal<Record<string, string | number | null>>({});

  readonly columns = computed(() => this.result()?.columns ?? []);
  readonly tableMinWidth = computed(() => `${Math.max(760, this.columns().length * 130)}px`);

  readonly hasFormFilters = computed(
    () =>
      this.warehouseId() !== null || this.product() !== null || this.categoryId() !== null ||
      this.supplierId() !== null || this.recipientId() !== null || this.costCenterId() !== null ||
      this.movementType() !== null || this.noveltyType() !== null || this.noveltyStatus() !== null ||
      this.priority() !== null || this.dateFrom() !== null || this.dateTo() !== null,
  );

  /** Chips de totales: cantidad para entrada/salida, moneda COP para el resto. */
  readonly totalChips = computed(() => {
    const totals = this.result()?.totals;
    if (!totals) return [];
    return Object.entries(totals).map(([key, value]) => ({
      key,
      label: this.humanize(key),
      value: QTY_TOTALS.has(key)
        ? (Number(value) || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
        : (this.currency.transform(Number(value) || 0, 'COP', 'symbol-narrow', '1.0-0') ?? '$0'),
    }));
  });

  constructor() {
    this.reports
      .catalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => this.catalog.set(c),
        error: () => {
          this.toast.error('No se pudo cargar el catálogo de reportes.');
          void this.router.navigate(['/reportes']);
        },
      });

    // Reacciona al parámetro :key (el componente se reutiliza entre reportes).
    effect(() => {
      const cat = this.catalog();
      if (!cat) return;
      const def = cat.reports.find((r) => r.key === this.key()) ?? null;
      if (!def) {
        void this.router.navigate(['/reportes']);
        return;
      }
      untracked(() => this.setup(def));
    });
  }

  // ---------- Inicialización ----------

  private setup(def: ReportDef): void {
    this.def.set(def);
    this.result.set(null);
    this.resetForm();
    this.loadOptions(def);
    this.apply();
  }

  /** Carga (una sola vez) las listas de los selects que declara el reporte. */
  private loadOptions(def: ReportDef): void {
    const need = (f: ReportFilterName): boolean => def.filters.includes(f) && !this.requested.has(f);
    if (need('category_id')) {
      this.requested.add('category_id');
      this.catalogApi.productCategories.all().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((l) => this.categories.set(l));
    }
    if (need('supplier_id')) {
      this.requested.add('supplier_id');
      this.catalogApi.suppliers.all().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((l) => this.suppliers.set(l));
    }
    if (need('recipient_id')) {
      this.requested.add('recipient_id');
      this.catalogApi.recipients.all().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((l) => this.recipients.set(l));
    }
    if (need('cost_center_id')) {
      this.requested.add('cost_center_id');
      this.catalogApi.costCenters.all().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((l) => this.costCenters.set(l));
    }
  }

  // ---------- Filtros ----------

  apply(): void {
    this.applied.set(this.buildFilters());
    this.run();
  }

  clear(): void {
    this.resetForm();
    this.apply();
  }

  private resetForm(): void {
    this.warehouseId.set(null);
    this.product.set(null);
    this.categoryId.set(null);
    this.supplierId.set(null);
    this.recipientId.set(null);
    this.costCenterId.set(null);
    this.movementType.set(null);
    this.noveltyType.set(null);
    this.noveltyStatus.set(null);
    this.priority.set(null);
    this.dateFrom.set(null);
    this.dateTo.set(null);
  }

  /** Solo los filtros que declara el reporte; el servicio descarta los vacíos. */
  private buildFilters(): Record<string, string | number | null> {
    const def = this.def();
    if (!def) return {};
    const values: Record<ReportFilterName, string | number | null> = {
      warehouse_id: this.warehouseId(),
      product_id: this.product()?.id ?? null,
      category_id: this.categoryId(),
      supplier_id: this.supplierId(),
      recipient_id: this.recipientId(),
      cost_center_id: this.costCenterId(),
      movement_type: this.movementType(),
      novelty_type: this.noveltyType(),
      novelty_status: this.noveltyStatus(),
      priority: this.priority(),
      date_from: this.toIso(this.dateFrom()),
      date_to: this.toIso(this.dateTo()),
    };
    return Object.fromEntries(def.filters.map((f) => [f, values[f]]));
  }

  // ---------- Consulta ----------

  private run(): void {
    const def = this.def();
    if (!def) return;
    const key = def.key;
    this.loading.set(true);
    this.reports
      .run(key, this.applied())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (this.def()?.key !== key) return;
          this.result.set(res);
          this.loading.set(false);
        },
        error: () => {
          if (this.def()?.key !== key) return;
          this.loading.set(false);
          this.toast.error('No se pudo generar el reporte', 'Intenta de nuevo o ajusta los filtros.');
        },
      });
  }

  // ---------- Exportación ----------

  exportAs(format: 'xlsx' | 'pdf'): void {
    const def = this.def();
    if (!def || this.exporting() !== null) return;
    this.exporting.set(format);
    this.reports
      .export(def.key, this.applied(), format)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.exporting.set(null);
          const url = URL.createObjectURL(blob);
          if (format === 'pdf') {
            window.open(url);
          } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.slug(def.title)}.xlsx`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
          }
        },
        error: () => {
          this.exporting.set(null);
          this.toast.error('No se pudo exportar el reporte', 'Intenta de nuevo en unos segundos.');
        },
      });
  }

  // ---------- Presentación ----------

  isNumeric(type: ReportColumnType): boolean {
    return type === 'money' || type === 'qty' || type === 'number';
  }

  /** "vencida_1_30" → "Vencida 1 30". */
  private humanize(key: string): string {
    const s = key.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** "Kardex valorizado" → "kardex-valorizado" (nombre del archivo exportado). */
  private slug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private toIso(d: Date | null): string | null {
    if (!d) return null;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
