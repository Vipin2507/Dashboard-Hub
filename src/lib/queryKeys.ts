import type { QueryClient } from "@tanstack/react-query";

/**
 * Background refetch interval for list/entity queries while a screen is open, so the UI
 * tracks the database without a full page refresh or tab switching.
 */
export const LIVE_ENTITY_POLL_MS = 30_000;

/**
 * Central registry of TanStack Query keys — use for queries and targeted invalidation.
 */
export const QK = {
  // Dashboard
  dashboard: () => ["dashboard"] as const,
  dashboardStats: () => ["dashboard", "stats"] as const,

  // Customers
  customers: (params?: object) => ["customers", params] as const,
  customer: (id: string) => ["customers", id] as const,
  customerContacts: (id: string) => ["customers", id, "contacts"] as const,
  customerNotes: (id: string) => ["customers", id, "notes"] as const,
  customerProposals: (id: string) => ["customers", id, "proposals"] as const,
  customerDeals: (id: string) => ["customers", id, "deals"] as const,
  customerPayments: (id: string) => ["customers", id, "payments"] as const,
  customerActivity: (id: string) => ["customers", id, "activity"] as const,

  // Proposals
  proposals: (params?: object) => ["proposals", params] as const,
  proposal: (id: string) => ["proposals", id] as const,

  // Deals
  deals: (params?: object) => ["deals", params] as const,
  deal: (id: string) => ["deals", id] as const,
  dealAudit: (id: string) => ["deals", id, "audit"] as const,

  // Payments
  paymentSummary: (customerId: string) => ["payments", "customer", customerId] as const,
  paymentPlans: () => ["payments", "plans"] as const,
  paymentHistory: (params?: object) => ["payments", "history", params] as const,
  paymentRemaining: () => ["payments", "remaining"] as const,

  // Inventory
  inventory: (params?: object) => ["inventory", params] as const,
  inventoryItem: (id: string) => ["inventory", id] as const,

  // Automation
  automationTemplates: () => ["automation", "templates"] as const,
  automationLogs: (params?: object) => ["automation", "logs", params] as const,
  automationSettings: () => ["automation", "settings"] as const,

  // Masters
  productCategories: () => ["masters", "product-categories"] as const,
  subscriptionTypes: () => ["masters", "subscription-types"] as const,
  proposalFormats: () => ["masters", "proposal-formats"] as const,

  // Users / Teams / Regions
  users: () => ["users"] as const,
  teams: () => ["teams"] as const,
  regions: () => ["regions"] as const,
  notifications: () => ["notifications"] as const,

  /** Sidebar badge counts (invalidate via `['proposals']` / `['deals']` / `['payments']` prefixes) */
  proposalPendingBadge: () => ["proposals", "badge", "pending"] as const,
  dealsNegotiationBadge: () => ["deals", "badge", "negotiation"] as const,
  paymentsOverdueBadge: () => ["payments", "badge", "overdue"] as const,

  dataControlMeta: () => ["data-control", "meta"] as const,
  dataControlRows: (moduleId: string) => ["data-control", "rows", moduleId] as const,

  subscriptionTracker: () => ["subscriptions", "tracker"] as const,
  subscriptionSettings: () => ["subscriptions", "settings"] as const,
};

/**
 * Invalidation helpers — call after mutations so related views stay in sync.
 */
export const INVALIDATE = {
  /** After any proposal change */
  proposal: (qc: QueryClient, proposalId: string, customerId?: string) => {
    qc.invalidateQueries({ queryKey: ["proposals"] });
    qc.invalidateQueries({ queryKey: QK.proposal(proposalId) });
    qc.invalidateQueries({ queryKey: QK.dashboard() });
    if (customerId) {
      qc.invalidateQueries({ queryKey: QK.customerProposals(customerId) });
      qc.invalidateQueries({ queryKey: QK.customer(customerId) });
      qc.invalidateQueries({ queryKey: QK.paymentSummary(customerId) });
    }
    qc.invalidateQueries({ queryKey: QK.notifications() });
  },

  /** After any deal change */
  deal: (qc: QueryClient, dealId: string, customerId?: string) => {
    qc.invalidateQueries({ queryKey: ["deals"] });
    qc.invalidateQueries({ queryKey: QK.deal(dealId) });
    qc.invalidateQueries({ queryKey: QK.dealAudit(dealId) });
    qc.invalidateQueries({ queryKey: QK.dashboard() });
    if (customerId) {
      qc.invalidateQueries({ queryKey: QK.customerDeals(customerId) });
      qc.invalidateQueries({ queryKey: QK.customerPayments(customerId) });
      qc.invalidateQueries({ queryKey: QK.customer(customerId) });
    }
    qc.invalidateQueries({ queryKey: QK.notifications() });
  },

  /** After any payment change */
  payment: (qc: QueryClient, customerId: string) => {
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: QK.dashboard() });
    qc.invalidateQueries({ queryKey: QK.customerPayments(customerId) });
    qc.invalidateQueries({ queryKey: QK.paymentSummary(customerId) });
    qc.invalidateQueries({ queryKey: QK.customer(customerId) });
    qc.invalidateQueries({ queryKey: QK.paymentRemaining() });
    qc.invalidateQueries({ queryKey: ["deals"] });
  },

  /** After any customer change */
  customer: (qc: QueryClient, customerId: string) => {
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: QK.customer(customerId) });
    qc.invalidateQueries({ queryKey: QK.dashboard() });
  },

  /** Full refresh (e.g. Reset Demo) */
  all: (qc: QueryClient) => {
    qc.invalidateQueries();
  },
};
