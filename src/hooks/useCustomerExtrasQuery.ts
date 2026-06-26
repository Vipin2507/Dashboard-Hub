import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QK, LIVE_ENTITY_POLL_MS } from "@/lib/queryKeys";
import type { CustomerAttachment, CustomerNote } from "@/types";

export type CustomerExtras = {
  notes: CustomerNote[];
  attachments: CustomerAttachment[];
};

export function useCustomerExtrasQuery(customerId: string | undefined) {
  return useQuery({
    queryKey: QK.customerNotes(customerId ?? ""),
    queryFn: () => api.get<CustomerExtras>(`/customers/${customerId}/notes-attachments`),
    enabled: Boolean(customerId),
    staleTime: 15_000,
    refetchInterval: LIVE_ENTITY_POLL_MS,
    refetchOnMount: "always",
  });
}
