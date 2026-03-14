import type { Role, Module, Action, Scope, MeContext } from '@/types';

interface ModulePolicy {
  scope: Scope;
  actions: Action[];
}

type RBACPolicy = Record<Role, Partial<Record<Module, ModulePolicy>>>;

export const RBAC_POLICY: RBACPolicy = {
  super_admin: {
    dashboard: { scope: 'ALL', actions: ['view'] },
    proposals: { scope: 'ALL', actions: ['view', 'create', 'update', 'delete', 'approve', 'reject', 'send', 'export', 'override_final_value'] },
    deals: { scope: 'ALL', actions: ['view', 'create', 'update', 'delete', 'export'] },
    customers: { scope: 'ALL', actions: ['view', 'create', 'update', 'delete', 'export'] },
    users: { scope: 'ALL', actions: ['view', 'create', 'update', 'delete'] },
    teams: { scope: 'ALL', actions: ['view', 'create', 'update', 'delete'] },
    regions: { scope: 'ALL', actions: ['view', 'create', 'update', 'delete'] },
    masters: { scope: 'ALL', actions: ['view', 'create', 'update', 'delete'] },
    email_log: { scope: 'ALL', actions: ['view'] },
    inventory: { scope: 'ALL', actions: ['view', 'create', 'update', 'delete', 'export'] },
  },
  finance: {
    dashboard: { scope: 'ALL', actions: ['view'] },
    proposals: { scope: 'ALL', actions: ['view', 'export'] },
    deals: { scope: 'ALL', actions: ['view', 'export'] },
    customers: { scope: 'ALL', actions: ['view', 'create', 'update', 'export'] },
    email_log: { scope: 'ALL', actions: ['view'] },
    inventory: { scope: 'ALL', actions: ['view', 'export'] },
  },
  sales_manager: {
    dashboard: { scope: 'TEAM', actions: ['view'] },
    proposals: { scope: 'TEAM', actions: ['view', 'create', 'update', 'approve', 'reject', 'send', 'export', 'override_final_value'] },
    deals: { scope: 'TEAM', actions: ['view', 'create', 'update'] },
    customers: { scope: 'REGION', actions: ['view', 'create', 'update'] },
    inventory: { scope: 'ALL', actions: ['view', 'create', 'update', 'export'] },
  },
  sales_rep: {
    dashboard: { scope: 'SELF', actions: ['view'] },
    proposals: { scope: 'SELF', actions: ['view', 'create', 'update', 'request_approval', 'send'] },
    deals: { scope: 'SELF', actions: ['view', 'create'] },
    customers: { scope: 'SELF', actions: ['view', 'create', 'update'] },
    email_log: { scope: 'SELF', actions: ['view'] },
    inventory: { scope: 'ALL', actions: ['view'] },
  },
  support: {
    dashboard: { scope: 'REGION', actions: ['view'] },
    proposals: { scope: 'REGION', actions: ['view'] },
    deals: { scope: 'REGION', actions: ['view'] },
    customers: { scope: 'REGION', actions: ['view', 'update'] },
    email_log: { scope: 'REGION', actions: ['view'] },
    inventory: { scope: 'ALL', actions: ['view'] },
  },
};

export function getModulePolicy(role: Role, module: Module): ModulePolicy | null {
  return RBAC_POLICY[role]?.[module] ?? null;
}

export function getScope(role: Role, module: Module): Scope {
  return getModulePolicy(role, module)?.scope ?? 'NONE';
}

export function can(role: Role, module: Module, action: Action): boolean {
  const policy = getModulePolicy(role, module);
  if (!policy) return false;
  return policy.actions.includes(action);
}

export function hasModuleAccess(role: Role, module: Module): boolean {
  const policy = getModulePolicy(role, module);
  return policy !== null && policy.scope !== 'NONE';
}

export function visibleWithScope<T extends { ownerUserId?: string; assignedTo?: string; teamId?: string; regionId?: string }>(
  scope: Scope,
  me: MeContext,
  records: T[]
): T[] {
  switch (scope) {
    case 'ALL': return records;
    case 'SELF': return records.filter(r => (r.ownerUserId ?? r.assignedTo) === me.id);
    case 'TEAM': return records.filter(r => r.teamId === me.teamId);
    case 'REGION': return records.filter(r => r.regionId === me.regionId);
    case 'NONE': return [];
  }
}

export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}
