export type RoleName =
  | 'admin'
  | 'solicitante'
  | 'aprobador'
  | 'comprador'
  | 'tesoreria'
  | 'bodeguero'
  | 'consulta';

export const ROLE_LABELS: Record<RoleName, string> = {
  admin: 'Administrador',
  solicitante: 'Solicitante',
  aprobador: 'Aprobador',
  comprador: 'Comprador',
  tesoreria: 'Tesorería',
  bodeguero: 'Bodeguero',
  consulta: 'Consulta',
};

export interface UserWarehouse {
  id: number;
  code: string;
  name: string;
  site_id: number;
}

export interface User {
  id: number;
  name: string;
  username: string | null;
  email: string;
  phone: string | null;
  is_active: boolean;
  default_warehouse_id: number | null;
  roles: RoleName[];
  permissions?: string[];
  warehouses: UserWarehouse[];
  sees_all_warehouses: boolean;
  last_login_at: string | null;
  created_at?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Role {
  id: number;
  name: RoleName;
  label: string;
  permissions: string[];
  users_count: number;
}

export interface Settings {
  company?: {
    name: string;
    document_number?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  default_tax_rate?: number;
}

export interface DocumentSequence {
  id: number;
  doc_type: string;
  name: string;
  prefix: string;
  next_number: number;
  padding: number;
}
