/** Respuesta paginada estándar de Laravel (Resource collections). */
export interface Paginated<T> {
  data: T[];
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
}

export interface Collection<T> {
  data: T[];
}

export interface Single<T> {
  data: T;
}

/** Parámetros de listado soportados por CrudController (API). */
export interface ListParams {
  search?: string;
  active?: '' | '1' | '0';
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
  all?: '1';
  [key: string]: string | number | boolean | undefined | null;
}

/** Errores de validación 422 de Laravel. */
export interface ValidationErrors {
  message: string;
  errors: Record<string, string[]>;
}

export interface BaseEntity {
  id: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}
