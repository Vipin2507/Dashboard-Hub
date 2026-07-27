import type { Customer, CustomerContact, CustomerStatus, MeContext, Region, User } from "@/types";
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

function syncPrimaryContactFromApi(
  contacts: CustomerContact[],
  row: CustomersApiListRow,
  fallbackName: string,
): CustomerContact[] {
  const apiEmail = row.email?.trim() || undefined;
  const apiPhone = row.primaryPhone?.trim() || undefined;
  if (contacts.length === 0) {
    return [
      {
        id: `ct-${row.id}`,
        name: fallbackName,
        email: apiEmail,
        phone: apiPhone,
        isPrimary: true,
      },
    ];
  }
  const primaryIdx = contacts.findIndex((c) => c.isPrimary);
  const idx = primaryIdx >= 0 ? primaryIdx : 0;
  return contacts.map((c, i) =>
    i === idx
      ? {
          ...c,
          email: apiEmail ?? c.email,
          phone: apiPhone ?? c.phone,
        }
      : c,
  );
}

/**
 * Merge an API list row into an existing UI customer.
 * API fields (email, phone, assignment) win; local-only fields (extra contacts, address lines) are kept.
 */
export function mergeApiCustomerRowToCustomer(
  row: CustomersApiListRow,
  existing: Customer | undefined,
  ctx: MapCustomerApiContext,
): Customer {
  const fromApi = mapApiCustomerRowToCustomer(row, ctx);
  if (!existing) return fromApi;

  const person = (row.customerName ?? "").trim();
  const company = (row.companyName ?? "").trim();
  const fallback = (company || person || row.name || "Customer").trim();

  return {
    ...existing,
    id: fromApi.id,
    customerNumber: fromApi.customerNumber,
    customerName: fromApi.customerName,
    companyName: fromApi.companyName,
    status: fromApi.status,
    gstin: fromApi.gstin,
    regionId: fromApi.regionId,
    regionName: fromApi.regionName,
    teamId: fromApi.teamId,
    assignedTo: fromApi.assignedTo,
    assignedToName: fromApi.assignedToName,
    tags: fromApi.tags,
    createdAt: fromApi.createdAt,
    updatedAt: new Date().toISOString(),
    address: {
      ...existing.address,
      city: row.city ?? existing.address?.city,
      state: row.state ?? existing.address?.state,
      country: existing.address?.country ?? "India",
    },
    contacts: syncPrimaryContactFromApi(existing.contacts ?? [], row, person || fallback),
  };
}
