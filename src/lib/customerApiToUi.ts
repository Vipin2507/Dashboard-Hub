import type { Customer, CustomerStatus, MeContext, Region, User } from "@/types";
import type { CustomersApiListRow } from "@/hooks/useCustomersListQuery";

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((t) => String(t)).filter(Boolean);
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map((t) => String(t)).filter(Boolean);
      } catch {
        /* fall through */
      }
    }
    return s
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

export type MapCustomerApiContext = {
  regions: Region[];
  users: User[];
  me: MeContext;
};

/** Map a `/api/customers` row into the rich `Customer` shape used across the app (Zustand, forms). */
export function mapApiCustomerRowToCustomer(row: CustomersApiListRow, ctx: MapCustomerApiContext): Customer {
  const { regions, users, me } = ctx;
  const regionName = regions.find((r) => r.id === row.regionId)?.name ?? "Unknown";
  const assignedUser =
    users.find((u) => u.name === row.salesExecutive) ??
    users.find((u) => u.regionId === row.regionId && u.role === "sales_rep") ??
    users[0];
  const nowIso = row.createdAt ?? new Date().toISOString();
  const person = (row.customerName ?? "").trim();
  const company = (row.companyName ?? "").trim();
  const fallback = (company || person || row.name || "Customer").trim();
  return {
    id: row.id,
    customerNumber: row.leadId ?? `CUST-${row.id.slice(-4).toUpperCase()}`,
    customerName: person || (company ? "" : (row.name ?? "").trim()) || fallback,
    companyName: company || (person ? "" : (row.name ?? "").trim()) || "",
    status: (row.status as CustomerStatus) ?? "active",
    gstin: row.gstin ?? undefined,
    pan: undefined,
    industry: undefined,
    website: undefined,
    address: {
      city: row.city ?? undefined,
      state: row.state ?? undefined,
      country: "India",
    },
    contacts: [
      {
        id: `ct-${row.id}`,
        name: person || fallback,
        email: row.email ?? undefined,
        phone: row.primaryPhone ?? undefined,
        isPrimary: true,
      },
    ],
    regionId: row.regionId,
    regionName,
    teamId: assignedUser?.teamId ?? users[0]?.teamId ?? "t1",
    assignedTo: assignedUser?.id ?? users[0]?.id ?? me.id,
    assignedToName: assignedUser?.name ?? row.salesExecutive ?? "Unassigned",
    tags: normalizeTags(row.tags),
    notes: [],
    attachments: [],
    productLines: [],
    payments: [],
    invoices: [],
    supportTickets: [],
    activityLog: [],
    totalRevenue: 0,
    totalDealValue: 0,
    activeProposalsCount: 0,
    activeDealsCount: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: me.id,
  };
}
