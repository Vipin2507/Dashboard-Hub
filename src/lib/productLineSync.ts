import { api } from "@/lib/api";
import type { CustomerProductLine, InventoryItem, Proposal, ProposalLineItem } from "@/types";

export type ProductLineWrite = {
  inventoryItemId: string;
  itemName: string;
  sku?: string;
  itemType?: string;
  qty: number;
  unitPrice: number;
  taxRate?: number;
  purchasedAt?: string;
  renewalDate?: string | null;
  expiryDate?: string | null;
  status?: CustomerProductLine["status"];
  dealId?: string;
  usageDetails?: string | null;
};

export function lineItemsToProductWrites(
  lineItems: ProposalLineItem[] | undefined,
  dealId: string,
  inventoryItems: InventoryItem[] = [],
): ProductLineWrite[] {
  const purchasedAt = new Date().toISOString().slice(0, 10);
  return (lineItems ?? []).map((li) => {
    const inv = inventoryItems.find((x) => x.id === li.inventoryItemId);
    const itemType = inv?.itemType ?? "product";
    let renewalDate: string | null = null;
    if (itemType === "subscription") {
      const d = new Date(`${purchasedAt}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() + 1);
        renewalDate = d.toISOString().slice(0, 10);
      }
    }
    return {
      inventoryItemId: li.inventoryItemId,
      itemName: li.name,
      sku: li.sku || inv?.sku || "",
      itemType,
      qty: li.qty,
      unitPrice: li.unitPrice,
      taxRate: li.taxRate,
      purchasedAt,
      renewalDate,
      expiryDate: renewalDate,
      status: "active" as const,
      dealId,
    };
  });
}

export async function persistCustomerProductLines(customerId: string, lines: ProductLineWrite[]) {
  if (!customerId || lines.length === 0) return [];
  return api.post<CustomerProductLine[]>(`/customers/${encodeURIComponent(customerId)}/product-lines/bulk`, {
    lines,
  });
}

export async function persistProductLinesFromProposal(args: {
  customerId: string;
  dealId: string;
  proposal: Pick<Proposal, "lineItems">;
  inventoryItems?: InventoryItem[];
}) {
  const lines = lineItemsToProductWrites(args.proposal.lineItems, args.dealId, args.inventoryItems ?? []);
  return persistCustomerProductLines(args.customerId, lines);
}
