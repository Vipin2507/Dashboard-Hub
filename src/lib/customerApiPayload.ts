import type { Customer, User } from "@/types";

/** Map UI `Customer` to the flat `/api/customers` body (email/phone from primary contact). */
export function toApiCustomerPayload(customer: Customer, users: User[]) {
  const primary = customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
  const email = primary?.email?.trim() || null;
  const primaryPhone = primary?.phone?.trim() || null;
  const displayName = (customer.companyName || customer.customerName || customer.customerNumber).trim();
  return {
    id: customer.id,
    leadId: customer.customerNumber,
    name: displayName,
    customerName: customer.customerName,
    companyName: customer.companyName || null,
    state: customer.address?.state ?? null,
    gstin: customer.gstin ?? null,
    regionId: customer.regionId,
    city: customer.address?.city ?? null,
    email,
    primaryPhone,
    status: customer.status,
    salesExecutive: users.find((u) => u.id === customer.assignedTo)?.name ?? customer.assignedToName ?? null,
    accountManager: null,
    deliveryExecutive: null,
    tags: customer.tags ?? [],
  };
}
