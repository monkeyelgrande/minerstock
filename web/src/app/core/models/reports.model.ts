/** Modelos de la fase 6: reportes, notificaciones, búsqueda global y log de actividad. */

// ---------- Reportes ----------
export type ReportColumnType = 'text' | 'date' | 'qty' | 'money' | 'number';

/** Filtros que puede declarar un reporte (el visor renderiza el control adecuado). */
export type ReportFilterName =
  | 'warehouse_id'
  | 'product_id'
  | 'category_id'
  | 'supplier_id'
  | 'recipient_id'
  | 'cost_center_id'
  | 'movement_type'
  | 'novelty_type'
  | 'novelty_status'
  | 'priority'
  | 'date_from'
  | 'date_to';

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  filters: ReportFilterName[];
}

export interface ReportCatalog {
  reports: ReportDef[];
  movement_types: { value: string; label: string }[];
  loan_statuses: { value: string; label: string }[];
}

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, number>;
}

// ---------- Notificaciones ----------
export interface AppNotification {
  id: string;
  key?: string;
  title: string;
  body: string;
  icon: string;
  route: string;
  params?: Record<string, string | number>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  data: AppNotification[];
  meta: { current_page: number; last_page: number; total: number };
  unread_count: number;
}

// ---------- Búsqueda global ----------
export interface SearchItem {
  id: number;
  title: string;
  subtitle: string;
  route: string;
  params?: Record<string, string | number>;
}

export interface SearchGroup {
  type: string;
  label: string;
  items: SearchItem[];
}

// ---------- Log de actividad ----------
export interface ActivityEntry {
  id: number;
  description: string;
  event: string | null;
  subject_type: string | null;
  subject_id: number | null;
  subject_number: string | null;
  causer: { id: number; name: string } | null;
  changes: {
    attributes: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
  };
  created_at: string;
}

export interface ActivityPage {
  data: ActivityEntry[];
  meta: { current_page: number; last_page: number; total: number; per_page: number };
  subject_types: string[];
}
