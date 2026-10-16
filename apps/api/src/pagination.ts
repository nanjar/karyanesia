import { z } from 'zod';
export const cursor = (value: unknown) => z.uuid().optional().parse(value);
// Identifiers are application constants, never request input. Keep native database precision.
export function beforeCursor(table: string, index: number, column = 'created_at') {
  if (!/^[a-z_]+$/.test(table) || !['created_at', 'due_at'].includes(column))
    throw Error('Invalid pagination identifier');
  return ` AND ($${index}::uuid IS NULL OR (${table}.${column},${table}.id)<(SELECT c.${column},c.id FROM ${table} c WHERE c.tenant_id=$1 AND c.id=$${index}))`;
}
