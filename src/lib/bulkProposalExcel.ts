import * as XLSX from "xlsx";
import type { MeContext, Proposal, ProposalLineItem, ProposalStatus, User, Region, InventoryItem } from "@/types";
import { apiUrl } from "@/lib/api";

export type ParseError = { row: number; message: string };

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function normHeader(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Maps normalized header → field key */
const PROPOSAL_HEADER_MAP: Record<string, keyof ProposalExcelRow> = {
  "sr no": "srNo",
  "sr no.": "srNo",
  "s no": "srNo",
  date: "date",
  month: "month",
  "lead id": "leadId",
  "lead name": "leadName",
  city: "city",
  "deal owner": "dealOwner",
  "company name": "companyName",
  "lead source": "leadSource",
  "proposal stage": "proposalStage",
  "proposal shared": "proposalShared",
  "no. of license": "noOfLicense",
  "no of license": "noOfLicense",
  licenses: "noOfLicense",
  "deal value": "dealValue",
  "payment receive": "paymentReceive",
  "payment received": "paymentReceive",
  remark: "remark",
  "follow up 1": "followUp1",
  "follow up 2": "followUp2",
  "region id (optional)": "regionIdOptional",
  "region id": "regionIdOptional",
};

export type ProposalExcelRow = {
  srNo: string;
  date: string;
  month: string;
  leadId: string;
  leadName: string;
  city: string;
  dealOwner: string;
  companyName: string;
  leadSource: string;
  proposalStage: string;
  proposalShared: string;
  noOfLicense: string;
  dealValue: string;
  paymentReceive: string;
  remark: string;
  followUp1: string;
  followUp2: string;
  regionIdOptional: string;
};

const EMPTY_ROW: ProposalExcelRow = {
  srNo: "",
  date: "",
  month: "",
  leadId: "",
  leadName: "",
  city: "",
  dealOwner: "",
  companyName: "",
  leadSource: "",
  proposalStage: "",
  proposalShared: "",
  noOfLicense: "",
  dealValue: "",
  paymentReceive: "",
  remark: "",
  followUp1: "",
  followUp2: "",
  regionIdOptional: "",
};

function sheetToMatrix(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: string[][] = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: string[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
      row.push(cell ? String(cell.v ?? "").trim() : "");
    }
    rows.push(row);
  }
  return rows;
}

export function downloadProposalsTemplate(regions: { id: string; name: string }[]): void {
  const wb = XLSX.utils.book_new();
  const regionsSheet = XLSX.utils.aoa_to_sheet([
    ["Region ID", "Region name"],
    ...regions.map((r) => [r.id, r.name]),
  ]);
  XLSX.utils.book_append_sheet(wb, regionsSheet, "Regions");

  const headers = [
    "Sr No.",
    "Date",
    "Month",
    "Lead Id",
    "Lead Name",
    "City",
    "Deal Owner",
    "Company Name",
    "Lead Source",
    "Proposal Stage",
    "Proposal Shared",
    "No. of License",
    "Deal Value",
    "Payment Receive",
    "Remark",
    "Follow up 1",
    "Follow up 2",
    "Region ID (optional)",
  ];
  const example = [
    "1",
    "2026-01-15",
    "January",
    "L-2001",
    "Jane Doe",
    "Dubai",
    "",
    "Example LLC",
    "Website",
    "Sent",
    "2026-01-16",
    "5",
    "50000",
    "10000",
    "Initial outreach",
    "2026-01-20",
    "2026-01-27",
    regions[0]?.id ?? "",
  ];
  const data = XLSX.utils.aoa_to_sheet([headers, example]);
  XLSX.utils.book_append_sheet(wb, data, "Proposals");

  XLSX.writeFile(wb, `proposals-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseProposalsWorkbook(file: File): Promise<{
  rows: { rowIndex: number; data: ProposalExcelRow }[];
  errors: ParseError[];
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === "proposals") ?? wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ row: 0, message: "Workbook has no sheets." }] };
  }
  const matrix = sheetToMatrix(wb.Sheets[sheetName]);
  if (matrix.length < 2) {
    return { rows: [], errors: [{ row: 1, message: "No data rows after header." }] };
  }

  const headerRow = matrix[0];
  const colToKey: Record<number, keyof ProposalExcelRow> = {};
  headerRow.forEach((cell, i) => {
    const n = normHeader(cell);
    const key = PROPOSAL_HEADER_MAP[n];
    if (key) colToKey[i] = key;
  });

  const required: (keyof ProposalExcelRow)[] = ["companyName", "dealValue"];
  const missing = required.filter((k) => !Object.values(colToKey).includes(k));
  if (missing.length) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `Missing required columns: Company Name, Deal Value. Found: ${Object.values(colToKey).join(", ") || "none"}`,
        },
      ],
    };
  }

  const rows: { rowIndex: number; data: ProposalExcelRow }[] = [];
  const errors: ParseError[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line.some((c) => String(c).trim())) continue;

    const data: ProposalExcelRow = { ...EMPTY_ROW };
    Object.entries(colToKey).forEach(([ci, key]) => {
      data[key] = String(line[Number(ci)] ?? "").trim();
    });

    if (!data.companyName.trim()) {
      errors.push({ row: r + 1, message: "Company Name is required." });
      continue;
    }
    const dv = parseFloat(String(data.dealValue).replace(/,/g, ""));
    if (!Number.isFinite(dv) || dv < 0) {
      errors.push({ row: r + 1, message: "Deal Value must be a non-negative number." });
      continue;
    }

    rows.push({ rowIndex: r + 1, data });
  }

  return { rows, errors };
}

type ApiCustomer = {
  id: string;
  leadId?: string | null;
  name: string;
  regionId: string;
  city?: string | null;
};

function mapStageToStatus(raw: string): ProposalStatus {
  const s = raw.trim().toLowerCase();
  if (!s) return "shared";
  if (s.includes("deal")) return "deal_created";
  if (s.includes("reject")) return "rejected";
  if (s.includes("approv") && !s.includes("pending")) return "approved";
  if (s.includes("pending") || s.includes("approval")) return "approval_pending";
  if (s.includes("shared")) return "shared";
  if (s.includes("sent")) return "sent";
  if (s.includes("draft")) return "draft";
  return "shared";
}

function parseExcelDate(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(t) ? t : undefined;
  if (iso) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const n = Number(t);
  const xlsxAny = XLSX as unknown as { SSF?: { parse_date_code?: (code: number) => { y: number; m: number; d: number } } };
  if (Number.isFinite(n) && n > 20000 && xlsxAny.SSF?.parse_date_code) {
    const d = xlsxAny.SSF.parse_date_code(n);
    if (d) {
      const js = new Date(Date.UTC(d.y, d.m - 1, d.d));
      return js.toISOString();
    }
  }
  const tryDate = new Date(t);
  return Number.isNaN(tryDate.getTime()) ? undefined : tryDate.toISOString();
}

function makeProposalNumberGenerator(existing: Proposal[]) {
  const year = new Date().getFullYear();
  const prefix = `PROP-${year}-`;
  let max = existing.reduce((m, p) => {
    if (!p.proposalNumber.startsWith(prefix)) return m;
    const num = parseInt(p.proposalNumber.slice(prefix.length), 10);
    return Number.isNaN(num) ? m : Math.max(m, num);
  }, 0);
  return () => {
    max += 1;
    return `${prefix}${String(max).padStart(4, "0")}`;
  };
}

export async function buildProposalsFromExcelRows(
  parsed: { rowIndex: number; data: ProposalExcelRow }[],
  ctx: {
    me: MeContext;
    users: User[];
    regions: Region[];
    inventoryItems: InventoryItem[];
    existingProposals: Proposal[];
    defaultRegionId: string;
  },
): Promise<{ proposals: Proposal[]; errors: ParseError[] }> {
  const errors: ParseError[] = [];
  const proposals: Proposal[] = [];
  const nextProposalNumber = makeProposalNumberGenerator(ctx.existingProposals);

  let customers: ApiCustomer[] = [];
  try {
    const res = await fetch(apiUrl("/api/customers"));
    if (res.ok) customers = (await res.json()) as ApiCustomer[];
  } catch {
    errors.push({ row: 0, message: "Failed to load customers from API." });
    return { proposals: [], errors };
  }

  const inv =
    ctx.inventoryItems.find((i) => i.isActive) ?? ctx.inventoryItems[0] ?? null;
  const taxRate = inv?.taxRate ?? 18;

  const findUser = (name: string): User | undefined => {
    const n = name.trim().toLowerCase();
    if (!n) return undefined;
    return ctx.users.find((u) => u.name.toLowerCase() === n);
  };

  const matchCustomer = (leadId: string, company: string, city: string): ApiCustomer | undefined => {
    const lid = leadId.trim();
    const comp = company.trim().toLowerCase();
    const cit = city.trim().toLowerCase();
    if (lid) {
      const byLead = customers.find((c) => (c.leadId ?? "").trim() === lid);
      if (byLead) return byLead;
    }
    return customers.find(
      (c) =>
        c.name.trim().toLowerCase() === comp &&
        (!cit || (c.city ?? "").trim().toLowerCase() === cit),
    );
  };

  const createCustomer = async (row: ProposalExcelRow): Promise<ApiCustomer | null> => {
    const regionId = row.regionIdOptional.trim() || ctx.defaultRegionId;
    if (!ctx.regions.some((r) => r.id === regionId)) {
      return null;
    }
    const body = {
      name: row.companyName.trim(),
      regionId,
      leadId: row.leadId.trim() || undefined,
      city: row.city.trim() || null,
      status: "lead",
      state: "Unknown",
    };
    const res = await fetch(apiUrl("/api/customers"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const created = (await res.json()) as ApiCustomer;
    customers = [...customers, created];
    return created;
  };

  for (const { rowIndex, data } of parsed) {
    let customer = matchCustomer(data.leadId, data.companyName, data.city);
    if (!customer) {
      const created = await createCustomer(data);
      if (!created) {
        errors.push({
          row: rowIndex,
          message:
            "No matching customer. Add Region ID (optional) for new companies, or create the customer first.",
        });
        continue;
      }
      customer = created;
    }

    const ownerName = data.dealOwner.trim();
    const dealOwnerUser = ownerName ? findUser(ownerName) : undefined;
    /** List visibility uses assignedTo / teamId / regionId — must match the importer or rows disappear under SELF/TEAM/REGION scope. */
    const assignee = ctx.me;

    const dealVal = parseFloat(String(data.dealValue).replace(/,/g, ""));
    const licenses = Math.max(1, Math.floor(parseFloat(data.noOfLicense) || 1));
    const lineTotalPreTax = dealVal / (1 + taxRate / 100);
    const unitPrice = lineTotalPreTax / licenses;
    const lineTotal = unitPrice * licenses;
    const taxAmount = (lineTotal * taxRate) / 100;

    const line: ProposalLineItem = {
      id: "li-" + makeId(),
      inventoryItemId: inv?.id ?? "",
      name: inv ? `${inv.name} (${licenses} lic.)` : `Licenses (${licenses})`,
      sku: inv?.sku ?? "IMPORT",
      description: data.leadSource ? `Source: ${data.leadSource}` : undefined,
      qty: licenses,
      unitPrice,
      taxRate,
      discount: 0,
      lineTotal,
      taxAmount,
    };

    const subtotal = lineTotal;
    const totalTax = taxAmount;
    const grandTotal = subtotal + totalTax;

    const status = mapStageToStatus(data.proposalStage);
    const createdFromRow = parseExcelDate(data.date) ?? new Date().toISOString();
    const sharedRaw = data.proposalShared.trim();
    const sentAt =
      status === "sent" || status === "approval_pending" || status === "approved" || status === "deal_created"
        ? parseExcelDate(sharedRaw) ?? parseExcelDate(data.date)
        : undefined;

    const titleBase = data.leadName.trim() || data.companyName.trim();
    const title = `Proposal — ${titleBase}`;

    const notesParts = [
      ownerName && (!dealOwnerUser || dealOwnerUser.id !== assignee.id) && `Deal owner (sheet): ${ownerName}`,
      data.remark && `Remark: ${data.remark}`,
      data.paymentReceive && `Payment received: ${data.paymentReceive}`,
      data.followUp1 && `Follow up 1: ${data.followUp1}`,
      data.followUp2 && `Follow up 2: ${data.followUp2}`,
      data.month && `Month: ${data.month}`,
    ].filter(Boolean);

    const pid = "p" + makeId();
    const now = new Date().toISOString();

    const proposal: Proposal = {
      id: pid,
      proposalNumber: nextProposalNumber(),
      title,
      customerId: customer.id,
      customerName: customer.name,
      customerCompanyName: (data.companyName.trim() || customer.name.trim()) || undefined,
      assignedTo: assignee.id,
      assignedToName: assignee.name,
      regionId: assignee.regionId,
      teamId: assignee.teamId,
      status,
      validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      lineItems: [line],
      subtotal,
      totalDiscount: 0,
      totalTax,
      grandTotal,
      finalQuoteValue: grandTotal,
      versionHistory: [
        {
          version: 1,
          createdAt: now,
          createdBy: ctx.me.id,
          createdByName: ctx.me.name,
          lineItems: [line],
          subtotal,
          totalDiscount: 0,
          totalTax,
          grandTotal,
          notes: notesParts.join(" | ") || undefined,
        },
      ],
      currentVersion: 1,
      notes: notesParts.join("\n") || undefined,
      customerNotes: data.remark || undefined,
      createdAt: createdFromRow,
      updatedAt: now,
      createdBy: ctx.me.id,
      sentAt,
    };

    proposals.push(proposal);
  }

  return { proposals, errors };
}
