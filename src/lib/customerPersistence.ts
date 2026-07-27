import { api } from "@/lib/api";
import { toApiCustomerPayload } from "@/lib/customerApiPayload";
import { mergeApiCustomerRowToCustomer, type MapCustomerApiContext } from "@/lib/customerApiToUi";
import type { CustomersApiListRow } from "@/hooks/useCustomersListQuery";
import { useAppStore } from "@/store/useAppStore";
import type { Customer, User } from "@/types";

/** PUT customer to API and return the saved row. */
export async function persistCustomerUpdate(customer: Customer, users: User[]) {
  return api.put<CustomersApiListRow>(`/customers/${customer.id}`, toApiCustomerPayload(customer, users));
}

export async function persistCustomerCreate(customer: Customer, users: User[]) {
  return api.post<CustomersApiListRow>("/customers", toApiCustomerPayload(customer, users));
}

/** Apply an API customer row into Zustand, preserving rich local fields (extra contacts, address lines, etc.). */
export function patchCustomerRowInStore(row: CustomersApiListRow, ctx: MapCustomerApiContext) {
  const state = useAppStore.getState();
  const existing = state.customers.find((c) => c.id === row.id);
  const merged = mergeApiCustomerRowToCustomer(row, existing, ctx);
  useAppStore.setState({
    customers: state.customers.some((c) => c.id === row.id)
      ? state.customers.map((c) => (c.id === row.id ? merged : c))
      : [merged, ...state.customers],
  });
  return merged;
}

export function mapCustomersApiRowsToStore(
  rows: CustomersApiListRow[],
  ctx: MapCustomerApiContext,
): Customer[] {
  const existing = useAppStore.getState().customers;
  return rows.map((row) => {
    const prev = existing.find((c) => c.id === row.id);
    return mergeApiCustomerRowToCustomer(row, prev, ctx);
  });
}
