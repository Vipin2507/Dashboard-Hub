import type { Role } from '@/types';
import type { DealPipelineStatus } from '@/lib/dealStatus';
import { DEAL_STATUSES } from '@/lib/dealStatus';

/** Super admin: full deal CRUD including soft delete and Closed/Lost. */
export function isDealSuperAdmin(role: Role): boolean {
  return role === 'super_admin';
}

export function canEditDeal(role: Role): boolean {
  return role === 'super_admin';
}

export function canDeleteDeal(role: Role): boolean {
  return role === 'super_admin';
}

/** Status options shown in dropdowns for create/edit (non–super admin cannot pick Closed/Lost). */
export function dealStatusOptionsForRole(role: Role): readonly DealPipelineStatus[] {
  if (role === 'super_admin') return DEAL_STATUSES;
  return DEAL_STATUSES.filter((s) => s !== 'Closed/Lost');
}
