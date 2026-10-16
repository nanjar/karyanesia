import type { Request } from 'express';
export type Role = 'OWNER' | 'ADMIN' | 'HR' | 'OPERATIONS' | 'SUPERVISOR' | 'STAFF';
export interface Actor {
  id: string;
  tenant_id: string;
  user_id: string;
  role: Role;
  full_name: string;
  employee_number: string;
  tenant_name: string;
  branch_id: string | null;
  scopes: string[];
}
export interface ApiRequest extends Request {
  actor: Actor;
  correlationId: string;
}
export const admins = (a: Actor) => a.role === 'OWNER' || a.role === 'ADMIN';
