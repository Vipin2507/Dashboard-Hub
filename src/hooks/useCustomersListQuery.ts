import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";

/** Raw `/api/customers` row — shared by dashboard RBAC helpers and Customers list sync. */
export type CustomersApiListRow = {
  id: string;
  leadId?: string;
  name: string;
  customerName?: string | null;
  companyName?: string | null;
  state?: string | null;
  gstin?: string | null;
  regionId: string;
  city?: string | null;
  email?: string | null;
  primaryPhone?: string | null;
  status?: string | null;
  createdAt?: string;
  salesExecutive?: string | null;
  accountManager?: string | null;
  deliveryExecutive?: string | null;
  tags?: string | string[] | null;
};

type UseCustomersListQueryOpts = {
  /** When false, the query does not run (e.g. closed dialogs). Default true. */
  enabled?: boolean;
};

export function useCustomersListQuery(options?: UseCustomersListQueryOpts) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: QK.customers(),
    queryFn: () => api.get<CustomersApiListRow[]>("/customers"),
    staleTime: 15_000,
    refetchInterval: enabled ? LIVE_ENTITY_POLL_MS : false,
    refetchOnMount: "always",
    enabled,
  });
}
