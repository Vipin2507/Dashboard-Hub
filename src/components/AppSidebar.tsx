import { BrandMark } from "@/components/BrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SIDEBAR_RAIL_BREAKPOINT_PX } from "@/config/layout";
import { useSidebarNav } from "@/contexts/SidebarNavContext";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";
import { navPillSpring } from "@/lib/motion";
import { getScope, hasModuleAccess, visibleWithScope } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { ROLE_LABELS } from "@/types";
import type { Module, Role } from "@/types";
import { motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  Database,
  FileText,
  Handshake,
  Mail,
  Map,
  Package,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  Settings,
  Truck,
  Users,
  UsersRound,
  X,
  Zap,
  LayoutDashboard,
  Banknote,
} from "lucide-react";
import type { ElementType } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface NavGroup {
  label: string;
  items: { label: string; module: Module; path: string; icon: ElementType }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "OVERVIEW",
    items: [{ label: "Dashboard", module: "dashboard", path: "/", icon: LayoutDashboard }],
  },
  {
    label: "CUSTOMER MANAGEMENT",
    items: [
      { label: "Customers", module: "customers", path: "/customers", icon: Building2 },
      { label: "Proposals", module: "proposals", path: "/proposals", icon: FileText },
      { label: "Deals", module: "deals", path: "/deals", icon: Handshake },
      { label: "Delivery", module: "delivery", path: "/delivery", icon: Truck },
      { label: "Automation", module: "automation", path: "/automation", icon: Zap },
      { label: "Payments", module: "payments", path: "/payments", icon: Banknote },
      { label: "Inventory", module: "inventory", path: "/inventory", icon: Package },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { label: "Users", module: "users", path: "/users", icon: Users },
      { label: "Teams", module: "teams", path: "/teams", icon: UsersRound },
      { label: "Regions", module: "regions", path: "/regions", icon: Map },
      { label: "Email Log", module: "email_log", path: "/email-log", icon: Mail },
      { label: "Masters", module: "masters", path: "/masters", icon: Settings },
      { label: "Data Control", module: "data_control_center", path: "/admin/data-control", icon: Database },
      {
        label: "Executive Performance",
        module: "executive_performance",
        path: "/admin/executive-performance",
        icon: BarChart3,
      },
    ],
  },
];

const ROLES: Role[] = ["super_admin", "finance", "sales_manager", "sales_rep", "support", "delivery_manager"];

function RoleSwitcher() {
  const me = useAppStore((s) => s.me);
  const users = useAppStore((s) => s.users);
  const switchRole = useAppStore((s) => s.switchRole);
  const switchUser = useAppStore((s) => s.switchUser);

  const usersForRole = users.filter((u) => u.role === me.role);
  const showUserPicker = usersForRole.length > 1;

  return (
    <>
      <label className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
        Switch Role
      </label>
      <Select value={me.role} onValueChange={(v) => switchRole(v as Role)}>
        <SelectTrigger className="h-8 border-sidebar-border bg-sidebar-accent text-xs text-sidebar-foreground">
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
          <label className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
            Switch User
          </label>
          <Select value={me.id} onValueChange={(v) => switchUser(v)}>
            <SelectTrigger className="h-8 border-sidebar-border bg-sidebar-accent text-xs text-sidebar-foreground">
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

export interface AppSidebarProps {
  onClose: () => void;
  collapsed?: boolean;
}

export function AppSidebar({ onClose, collapsed = false }: AppSidebarProps) {
  const me = useAppStore((s) => s.me);
  const loggedInUser = useAppStore((s) => s.users.find((u) => u.id === s.authUserId));
  const isSuperLoggedIn = loggedInUser?.role === "super_admin";
  const customers = useAppStore((s) => s.customers);
  const automationLogs = useAppStore((s) => s.automationLogs);
  const navigate = useNavigate();
  const location = useLocation();
  const { proposalsBadge, dealsBadge, paymentsBadge } = useSidebarBadges();
  const { toggleCollapsed, isLgUp } = useSidebarNav();

  const customerScope = getScope(me.role, "customers");
  const visibleCustomers = visibleWithScope(customerScope, me, customers);
  const leadCount = visibleCustomers.filter((c) => c.status === "lead").length;
  const showProposalBadge =
    (me.role === "super_admin" || me.role === "sales_manager") && proposalsBadge > 0;
  const showDealsBadge = dealsBadge > 0;
  const showPaymentsBadge =
    (me.role === "super_admin" || me.role === "finance") && paymentsBadge > 0;
  const showCustomerLeadBadge =
    (me.role === "super_admin" || me.role === "sales_manager") && leadCount > 0;
  const failedLogsCount = automationLogs.filter((l) => l.status === "failed").length;
  const showAutomationBadge = failedLogsCount > 0;

  const go = (path: string) => {
    navigate(path);
    if (typeof window !== "undefined" && window.innerWidth < SIDEBAR_RAIL_BREAKPOINT_PX) {
      onClose();
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-0" : "justify-between px-2.5",
        )}
      >
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <BrandMark />
          {!collapsed && <span className="text-[13px] font-semibold tracking-tight">Buildesk</span>}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-0.5">
            {isLgUp && (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                aria-label="Collapse sidebar"
                title="Collapse"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <nav className={cn("scrollbar-rail flex-1 overflow-y-auto py-2", collapsed ? "px-1.5" : "space-y-4 px-1.5")}>
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => hasModuleAccess(me.role, item.module));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className={cn(!collapsed && "mb-3")}>
              {!collapsed && (
                <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/45">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active =
                    location.pathname === item.path ||
                    (item.path === "/customers" && location.pathname.startsWith("/customers/")) ||
                    (item.path === "/payments" && location.pathname.startsWith("/payments"));
                  const isProposals = item.module === "proposals";
                  const isDeals = item.module === "deals";
                  const isPayments = item.module === "payments";
                  const isCustomers = item.module === "customers";
                  const isAutomation = item.module === "automation";
                  const badge =
                    (isProposals && showProposalBadge && (proposalsBadge > 99 ? "99+" : proposalsBadge)) ||
                    (isDeals && showDealsBadge && (dealsBadge > 99 ? "99+" : dealsBadge)) ||
                    (isPayments && showPaymentsBadge && (paymentsBadge > 99 ? "99+" : paymentsBadge)) ||
                    (isCustomers && showCustomerLeadBadge && leadCount) ||
                    (isAutomation && showAutomationBadge && failedLogsCount) ||
                    null;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      title={collapsed ? item.label : undefined}
                      onClick={() => go(item.path)}
                      className={cn(
                        "relative flex w-full items-center text-[13px] font-medium transition-colors",
                        collapsed
                          ? "mx-auto h-9 w-9 justify-center rounded-md"
                          : "gap-2.5 rounded-md px-2.5 py-1.5",
                        active
                          ? "text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className={cn(
                            "absolute inset-0 rounded-md bg-sidebar-accent",
                            !collapsed && "border-l-[3px] border-l-primary",
                          )}
                          transition={navPillSpring}
                        />
                      )}
                      <item.icon className="relative z-[1] h-4 w-4 shrink-0" />
                      {!collapsed && <span className="relative z-[1] min-w-0 truncate text-left">{item.label}</span>}
                      {!collapsed && badge != null && (
                        <Badge
                          variant="outline"
                          className="relative z-[1] ml-auto h-5 min-w-5 border-0 bg-primary px-1.5 text-[10px] text-primary-foreground"
                        >
                          {badge}
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

      <div className={cn("shrink-0 border-t border-sidebar-border", collapsed ? "p-1.5" : "space-y-2 p-2.5")}>
        {!collapsed && isSuperLoggedIn && <RoleSwitcher />}
        {!collapsed && isSuperLoggedIn && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => useAppStore.getState().resetDemo()}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Demo
          </Button>
        )}
        {isLgUp && collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Expand sidebar"
            title="Expand"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
