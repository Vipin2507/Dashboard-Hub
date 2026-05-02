import { api } from "@/lib/api";
import type { Customer } from "@/types";

function trimStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = typeof v === "string" ? v.trim() : String(v).trim();
  return s || undefined;
}

/**
 * Primary phone/email for automations — supports UI `Customer` (contacts[]) and
 * API rows (`email`, `primaryPhone` on the object).
 */
export function primaryReachabilityFromUnknown(c: unknown): { name?: string; phone?: string; email?: string } {
  if (!c || typeof c !== "object") return {};
  const o = c as Record<string, unknown> & Partial<Customer>;
  const contacts = Array.isArray(o.contacts) ? o.contacts : [];
  const primary =
    (contacts.find((x) => x && typeof x === "object" && (x as { isPrimary?: boolean }).isPrimary) as
      | { name?: string; phone?: string; email?: string }
      | undefined) ?? (contacts[0] as { name?: string; phone?: string; email?: string } | undefined);

  const fromContact = primary
    ? {
        name: trimStr(primary.name),
        phone: trimStr(primary.phone),
        email: trimStr(primary.email),
      }
    : { name: undefined, phone: undefined, email: undefined };

  const phone = fromContact.phone ?? trimStr(o.primaryPhone);
  const email = fromContact.email ?? trimStr(o.email);
  const name =
    fromContact.name ?? trimStr(o.customerName) ?? trimStr(o.companyName) ?? trimStr((o as { name?: string }).name);

  return { name, phone, email };
}

/**
 * Resolves customer phone/email for webhooks: Zustand customer first, then GET /customers/:id
 * when anything is missing (Proposals page often has no customers in the store).
 */
export async function resolveCustomerNotifyReachability(
  customerId: string | undefined,
  storeCustomer: Customer | null | undefined,
): Promise<{ name?: string; phone?: string; email?: string }> {
  const fromStore = primaryReachabilityFromUnknown(storeCustomer ?? undefined);
  const needApi = Boolean(customerId) && (!fromStore.phone || !fromStore.email);
  if (!needApi) return fromStore;

  try {
    const row = await api.get<unknown>(`/customers/${customerId}`);
    const fromApi = primaryReachabilityFromUnknown(row);
    return {
      name: fromStore.name ?? fromApi.name,
      phone: fromStore.phone ?? fromApi.phone,
      email: fromStore.email ?? fromApi.email,
    };
  } catch {
    return fromStore;
  }
}
