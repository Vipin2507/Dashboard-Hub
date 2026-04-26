import type { Role } from '@/types';
import type { DealPipelineStatus } from '@/lib/dealStatus';
import { DEAL_STATUSES } from '@/lib/dealStatus';

/**
 * Deals authorization helpers (MoM 19/04/2026).
 * Note: list scoping is handled via `src/lib/rbac` (getScope/visibleWithScope).
 */
export function isDealSuperAdmin(role: Role): boolean {
  return role === 'super_admin';
}

export function canEditDeal(role: Role): boolean {
  return role === 'super_admin' || role === 'sales_manager';
}

export function canDeleteDeal(role: Role): boolean {
  return role === 'super_admin';
}

export function canAssignDeal(role: Role): boolean {
  return role === 'super_admin' || role === 'sales_manager';
}

export function canChangeDealStage(role: Role): boolean {
  return role === 'super_admin' || role === 'sales_manager' || role === 'sales_rep';
}

/** Status options shown in dropdowns for create/edit (non–super admin cannot pick Closed/Lost). */
export function dealStatusOptionsForRole(role: Role): readonly DealPipelineStatus[] {
  if (role === 'super_admin') return DEAL_STATUSES;
  return DEAL_STATUSES.filter((s) => s !== 'Closed/Lost');
}
