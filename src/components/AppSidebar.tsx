import { useAppStore } from '@/store/useAppStore';
import { hasModuleAccess, getScope, visibleWithScope } from '@/lib/rbac';
import { useSidebarBadges } from '@/hooks/useSidebarBadges';
import { ROLE_LABELS } from '@/types';
import type { Module, Role } from '@/types';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SIDEBAR_RAIL_BREAKPOINT_PX } from '@/config/layout';
import {
  LayoutDashboard,
  FileText,
  Handshake,
  Users,
  Building2,
  Map,
  Mail,
  UsersRound,
  RotateCcw,
  Package,
  Settings,
  Zap,
  Banknote,
  Database,
  X,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
      { label: 'Delivery', module: 'delivery', path: '/delivery', icon: Truck },
      { label: 'Automation', module: 'automation', path: '/automation', icon: Zap },
      { label: 'Payments', module: 'payments', path: '/payments', icon: Banknote },
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
      { label: 'Data Control', module: 'data_control_center', path: '/admin/data-control', icon: Database },
    ],
  },
];

const ROLES: Role[] = ['super_admin', 'finance', 'sales_manager', 'sales_rep', 'support', 'delivery_manager'];

function RoleSwitcher() {
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const switchRole = useAppStore((s) => s.switchRole);
  const switchUser = useAppStore((s) => s.switchUser);

  const usersForRole = users.filter((u) => u.role === me.role);
  const showUserPicker = usersForRole.length > 1;

  return (
    <>
      <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Switch Role
      </label>
      <Select value={me.role} onValueChange={(v) => switchRole(v as Role)}>
        <SelectTrigger className="h-10 min-h-11 border-border bg-secondary text-sm sm:h-9 sm:min-h-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r} className="text-sm">
              {ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showUserPicker && (
        <>
          <label className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Switch User
          </label>
          <Select value={me.id} onValueChange={(v) => switchUser(v)}>
            <SelectTrigger className="h-10 min-h-11 border-border bg-secondary text-sm sm:h-9 sm:min-h-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {usersForRole.map((u) => (
                <SelectItem key={u.id} value={u.id} className="text-sm">
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </>
  );
}

function ResetDemoButton() {
  const resetDemo = useAppStore((s) => s.resetDemo);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-10 min-h-11 w-full text-sm text-muted-foreground sm:h-9 sm:min-h-0"
      onClick={resetDemo}
    >
      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Demo
    </Button>
  );
}

export interface AppSidebarProps {
  onClose: () => void;
}

export function AppSidebar({ onClose }: AppSidebarProps) {
  const me = useAppStore((s) => s.me);
  const loggedInUser = useAppStore((s) => s.users.find((u) => u.id === s.authUserId));
  const isSuperLoggedIn = loggedInUser?.role === 'super_admin';
  const customers = useAppStore((s) => s.customers);
  const automationLogs = useAppStore((s) => s.automationLogs);
  const navigate = useNavigate();
  const location = useLocation();
  const { proposalsBadge, dealsBadge, paymentsBadge } = useSidebarBadges();

  const customerScope = getScope(me.role, 'customers');
  const visibleCustomers = visibleWithScope(customerScope, me, customers);
  const leadCount = visibleCustomers.filter((c) => c.status === 'lead').length;
  const showProposalBadge =
    (me.role === 'super_admin' || me.role === 'sales_manager') && proposalsBadge > 0;
  const showDealsBadge = dealsBadge > 0;
  const showPaymentsBadge =
    (me.role === 'super_admin' || me.role === 'finance') && paymentsBadge > 0;
  const showCustomerLeadBadge =
    (me.role === 'super_admin' || me.role === 'sales_manager') && leadCount > 0;
  const failedLogsCount = automationLogs.filter((l) => l.status === 'failed').length;
  const showAutomationBadge = failedLogsCount > 0;

  const go = (path: string) => {
    navigate(path);
    if (typeof window !== 'undefined' && window.innerWidth < SIDEBAR_RAIL_BREAKPOINT_PX) {
      onClose();
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
        <span className="text-lg font-bold text-blue-600">Buildesk</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => hasModuleAccess(me.role, item.module));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground sm:text-[11px]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active =
                    location.pathname === item.path ||
                    (item.path === '/customers' && location.pathname.startsWith('/customers/')) ||
                    (item.path === '/payments' && location.pathname.startsWith('/payments'));
                  const isProposals = item.module === 'proposals';
                  const isDeals = item.module === 'deals';
                  const isPayments = item.module === 'payments';
                  const isCustomers = item.module === 'customers';
                  const isAutomation = item.module === 'automation';
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => go(item.path)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors sm:min-h-0 sm:py-2',
                        active
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-secondary',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="text-left">{item.label}</span>
                      {isProposals && showProposalBadge && (
                        <Badge
                          variant="outline"
                          className="ml-auto h-5 min-w-5 border-0 bg-amber-500 px-1.5 text-[10px] text-white hover:bg-amber-500"
                        >
                          {proposalsBadge > 99 ? '99+' : proposalsBadge}
                        </Badge>
                      )}
                      {isDeals && showDealsBadge && (
                        <Badge
                          variant="outline"
                          className="ml-auto h-5 min-w-5 border-0 bg-blue-600 px-1.5 text-[10px] text-white hover:bg-blue-600"
                        >
                          {dealsBadge > 99 ? '99+' : dealsBadge}
                        </Badge>
                      )}
                      {isPayments && showPaymentsBadge && (
                        <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-[10px]">
                          {paymentsBadge > 99 ? '99+' : paymentsBadge}
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

      <div className="flex-shrink-0 space-y-2 border-t border-gray-200 p-3 dark:border-gray-800">
        {isSuperLoggedIn && <RoleSwitcher />}
        {isSuperLoggedIn && <ResetDemoButton />}
      </div>
    </div>
  );
}
