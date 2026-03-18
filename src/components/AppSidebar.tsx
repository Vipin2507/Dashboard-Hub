import { useAppStore } from '@/store/useAppStore';
import { hasModuleAccess, getScope, visibleWithScope } from '@/lib/rbac';
import { ROLE_LABELS } from '@/types';
import type { Module, Role } from '@/types';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Handshake, Users, Building2, Map, Mail, UsersRound, RotateCcw, Package, Settings,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface NavGroup {
  label: string;
  items: { label: string; module: Module; path: string; icon: React.ElementType }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { label: 'Dashboard', module: 'dashboard', path: '/', icon: LayoutDashboard },
    ],
  },
  {
    label: 'CUSTOMER MANAGEMENT',
    items: [
      { label: 'Customers', module: 'customers', path: '/customers', icon: Building2 },
      { label: 'Proposals', module: 'proposals', path: '/proposals', icon: FileText },
      { label: 'Deals', module: 'deals', path: '/deals', icon: Handshake },
      { label: 'Automation', module: 'automation', path: '/automation', icon: Zap },
      { label: 'Inventory', module: 'inventory', path: '/inventory', icon: Package },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { label: 'Users', module: 'users', path: '/users', icon: Users },
      { label: 'Teams', module: 'teams', path: '/teams', icon: UsersRound },
      { label: 'Regions', module: 'regions', path: '/regions', icon: Map },
      { label: 'Email Log', module: 'email_log', path: '/email-log', icon: Mail },
      { label: 'Masters', module: 'masters', path: '/masters', icon: Settings },
    ],
  },
];

const ROLES: Role[] = ['super_admin', 'finance', 'sales_manager', 'sales_rep', 'support'];

export function AppSidebar() {
  const me = useAppStore(s => s.me);
  const proposals = useAppStore(s => s.proposals);
  const customers = useAppStore(s => s.customers);
  const automationLogs = useAppStore(s => s.automationLogs);
  const switchRole = useAppStore(s => s.switchRole);
  const resetDemo = useAppStore(s => s.resetDemo);
  const navigate = useNavigate();
  const location = useLocation();
  const proposalScope = getScope(me.role, 'proposals');
  const customerScope = getScope(me.role, 'customers');
  const visibleProposals = visibleWithScope(proposalScope, me, proposals);
  const visibleCustomers = visibleWithScope(customerScope, me, customers);
  const pendingCount = visibleProposals.filter(p => p.status === 'approval_pending').length;
  const leadCount = visibleCustomers.filter(c => c.status === 'lead').length;
  const showProposalBadge = (me.role === 'super_admin' || me.role === 'sales_manager') && pendingCount > 0;
  const showCustomerLeadBadge = (me.role === 'super_admin' || me.role === 'sales_manager') && leadCount > 0;
  const failedLogsCount = automationLogs.filter(l => l.status === 'failed').length;
  const showAutomationBadge = failedLogsCount > 0;

  return (
    <aside className="w-[220px] min-w-[220px] h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-y-auto">
      {/* Logo */}
      <div className="px-5 py-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="text-base font-bold text-foreground tracking-tight">Buildesk</span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 pb-3 space-y-5 mt-2">
        {NAV_GROUPS.map(group => {
          const visibleItems = group.items.filter(item => hasModuleAccess(me.role, item.module));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const active = location.pathname === item.path || (item.path === '/customers' && location.pathname.startsWith('/customers/'));
                  const isProposals = item.module === 'proposals';
                  const isCustomers = item.module === 'customers';
                  const isAutomation = item.module === 'automation';
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                        active
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-sidebar-foreground hover:bg-secondary'
                      }`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                      {isProposals && showProposalBadge && (
                        <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-[10px]">
                          {pendingCount}
                        </Badge>
                      )}
                      {isCustomers && showCustomerLeadBadge && (
                        <Badge variant="secondary" className="ml-auto h-5 min-w-5 px-1.5 text-[10px]">
                          {leadCount}
                        </Badge>
                      )}
                      {isAutomation && showAutomationBadge && (
                        <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-[10px]">
                          {failedLogsCount}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom: Role switcher */}
      <div className="px-4 py-3 border-t border-sidebar-border space-y-2">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Switch Role</label>
        <Select value={me.role} onValueChange={(v) => switchRole(v as Role)}>
          <SelectTrigger className="h-8 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map(r => (
              <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground text-[11px] h-7" onClick={resetDemo}>
          <RotateCcw className="w-3 h-3 mr-1.5" /> Reset Demo
        </Button>
      </div>
    </aside>
  );
}
