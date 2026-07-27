import * as XLSX from "xlsx";
import type { Deal, MeContext, User, Team } from "@/types";
import { apiUrl } from "@/lib/api";
import { DEAL_STATUSES, normalizeDealStatus } from "@/lib/dealStatus";

export type ParseError = { row: number; message: string };

function normHeader(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[#"']/g, "");
}

export type DealExcelRow = {
  /** CRM Client Id — used for duplicate detection */
  clientId: string;
  customerName: string;
  sheetDate: string;
  startDate: string;
  endDate: string;
  subscribedModules: string;
  licensesTotal: string;
  licensesActive: string;
  /** Amount without tax */
  amountWithoutTax: string;
  /** Total with GST */
  totalWithGst: string;
  taxAmount: string;
  paidDate: string;
  amountPaid: string;
  balanceDue: string;
  nextDueDate: string;
  nextInvoiceGenerated: string;
  nextInstallmentAmount: string;
  nextInstallmentRemarks: string;
  assignedTeam: string;
  salesAgent: string;
  deliveryMember: string;
  status: string;
  remarks: string;
  /** Legacy template fields */
  invoiceDate: string;
  invoiceNumber: string;
  placeOfSupply: string;
  serviceName: string;
};

const EMPTY_ROW: DealExcelRow = {
  clientId: "",
  customerName: "",
  sheetDate: "",
  startDate: "",
  endDate: "",
  subscribedModules: "",
  licensesTotal: "",
  licensesActive: "",
  amountWithoutTax: "",
  totalWithGst: "",
  taxAmount: "",
  paidDate: "",
  amountPaid: "",
  balanceDue: "",
  nextDueDate: "",
  nextInvoiceGenerated: "",
  nextInstallmentAmount: "",
  nextInstallmentRemarks: "",
  assignedTeam: "",
  salesAgent: "",
  deliveryMember: "",
  status: "",
  remarks: "",
  invoiceDate: "",
  invoiceNumber: "",
  placeOfSupply: "",
  serviceName: "",
};

/** Normalized header → field. Supports both the CRM multi-row sheet and the legacy template. */
const DEAL_HEADER_MAP: Record<string, keyof DealExcelRow> = {
  // CRM — top-level / flattened
  date: "sheetDate",
  "client id from crm admin": "clientId",
  "client id": "clientId",
  "crm client id": "clientId",
  "customer name/company name": "customerName",
  "customer name / company name": "customerName",
  "customer name": "customerName",
  "company name": "customerName",
  "subscription/contact period start date": "startDate",
  "subscription/contact period end date": "endDate",
  "subscription start date": "startDate",
  "subscription end date": "endDate",
  "start date": "startDate",
  "end date": "endDate",
  "subscribed modules": "subscribedModules",
  "licenses no of licenses": "licensesTotal",
  "licenses active licenses": "licensesActive",
  "no of licenses": "licensesTotal",
  "active licenses": "licensesActive",
  "total deal value amount": "amountWithoutTax",
  "total deal value with gst": "totalWithGst",
  "deal value amount": "amountWithoutTax",
  "deal value with gst": "totalWithGst",
  amount: "amountWithoutTax",
  "with gst": "totalWithGst",
  "annual payment (paid) date": "paidDate",
  "annual payment (paid) amount": "amountPaid",
  "annual payment date": "paidDate",
  "annual payment amount": "amountPaid",
  "outstanding payment (due)": "balanceDue",
  "outstanding payment": "balanceDue",
  "outstanding due": "balanceDue",
  "next installment due date": "nextDueDate",
  "next installment invoice generated": "nextInvoiceGenerated",
  "next installment amount": "nextInstallmentAmount",
  "next installment remarks": "nextInstallmentRemarks",
  "due date": "nextDueDate",
  "invoice generated": "nextInvoiceGenerated",
  "assigned team": "assignedTeam",
  team: "assignedTeam",
  "sales agent": "salesAgent",
  "sales executive": "salesAgent",
  "delivery member": "deliveryMember",
  "delivery executive": "deliveryMember",
  status: "status",
  remarks: "remarks",

  // Legacy template
  "invoice date": "invoiceDate",
  "invoice": "invoiceNumber",
  "invoice no": "invoiceNumber",
  "invoice no.": "invoiceNumber",
  "invoice number": "invoiceNumber",
  total: "totalWithGst",
  "tax amount": "taxAmount",
  "amount without tax": "amountWithoutTax",
  "place of supply": "placeOfSupply",
  balance: "balanceDue",
  "amount paid": "amountPaid",
  service: "serviceName",
  "service name": "serviceName",
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
      let v = "";
      if (cell) {
        if (cell.w != null && String(cell.w).trim()) v = String(cell.w).trim();
        else if (cell.v != null) v = String(cell.v).trim();
      }
      row.push(v);
    }
    rows.push(row);
  }
  return rows;
}

function looksLikeSubHeaderRow(row: string[]): boolean {
  const joined = row.map(normHeader).filter(Boolean).join(" | ");
  return (
    joined.includes("start date") ||
    joined.includes("with gst") ||
    joined.includes("no of licenses") ||
    joined.includes("active licenses") ||
    joined.includes("invoice generated")
  );
}

/** Flatten a 1- or 2-row header into unique column labels. */
export function flattenDealHeaders(matrix: string[][]): { headers: string[]; dataStartRow: number } {
  if (matrix.length === 0) return { headers: [], dataStartRow: 0 };
  const row0 = matrix[0] ?? [];
  const row1 = matrix[1] ?? [];
  const useTwoRows = matrix.length > 1 && looksLikeSubHeaderRow(row1);

  if (!useTwoRows) {
    return { headers: row0.map((c) => String(c ?? "").trim()), dataStartRow: 1 };
  }

  let parent = "";
  const headers: string[] = [];
  const width = Math.max(row0.length, row1.length);
  for (let i = 0; i < width; i++) {
    const top = String(row0[i] ?? "").trim();
    const child = String(row1[i] ?? "").trim();
    if (top) parent = top;
    if (child && parent) {
      const p = normHeader(parent);
      const c = normHeader(child);
      // Avoid "Amount Amount" / duplicate parent when child repeats parent words poorly
      if (p === c) headers.push(parent);
      else if (p.includes(c) && c.length > 3) headers.push(parent);
      else headers.push(`${parent} ${child}`);
    } else if (child) {
      headers.push(child);
    } else {
      headers.push(parent);
    }
  }
  return { headers, dataStartRow: 2 };
}

export function parseMoney(raw: string): number | null {
  const cleaned = String(raw ?? "")
    .replace(/₹/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();
  if (!cleaned || cleaned === "-" || cleaned === "—") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseDateCell(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const n = Number(t);
  const xlsxAny = XLSX as unknown as {
    SSF?: { parse_date_code?: (code: number) => { y: number; m: number; d: number } };
  };
  if (Number.isFinite(n) && n > 20000 && xlsxAny.SSF?.parse_date_code) {
    const d = xlsxAny.SSF.parse_date_code(n);
    if (d) {
      const js = new Date(Date.UTC(d.y, d.m - 1, d.d));
      return js.toISOString().slice(0, 10);
    }
  }
  const tryDate = new Date(t);
  return Number.isNaN(tryDate.getTime()) ? null : tryDate.toISOString().slice(0, 10);
}

export function downloadDealsTemplate(): void {
  const wb = XLSX.utils.book_new();

  const header1 = [
    "Date",
    "Client Id from CRM Admin",
    "Customer Name/Company Name",
    "Subscription/Contact Period",
    "",
    "Subscribed Modules",
    "Licenses",
    "",
    "Total Deal Value",
    "Total Deal Value",
    "Annual Payment (Paid)",
    "",
    "Outstanding Payment (Due)",
    "Next Installment",
    "",
    "",
    "",
    "Assigned Team",
    "Sales Agent",
    "Delivery Member",
    "Status",
    "Remarks",
  ];
  const header2 = [
    "",
    "",
    "",
    "Start date",
    "End Date",
    "",
    "No of Licenses",
    "Active Licenses",
    "Amount",
    "With GST",
    "Date",
    "Amount",
    "",
    "Due Date",
    "Invoice generated",
    "Amount",
    "Remarks",
    "",
    "",
    "",
    "",
    "",
  ];
  const example = [
    "2025-11-01",
    "CRM-1001",
    "SPOTLIGHT FINANCE AND CONSULTANCY PVT LTD",
    "2025-11-01",
    "2026-10-31",
    "ERP",
    "10",
    "10",
    "100000",
    "118000",
    "2025-11-15",
    "59000",
    "59000",
    "2026-02-15",
    "Yes",
    "59000",
    "Second installment",
    "West Team",
    "Amit Sharma",
    "Priya Delivery",
    "Active",
    "Imported from CRM",
  ];

  const sheet = XLSX.utils.aoa_to_sheet([header1, header2, example]);
  XLSX.utils.book_append_sheet(wb, sheet, "Deals");
  XLSX.writeFile(wb, `deals-crm-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseDealsWorkbook(file: File): Promise<{
  rows: { rowIndex: number; data: DealExcelRow }[];
  errors: ParseError[];
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "deals") ?? wb.SheetNames[0];
  if (!sheetName) return { rows: [], errors: [{ row: 0, message: "Workbook has no sheets." }] };

  const matrix = sheetToMatrix(wb.Sheets[sheetName]);
  if (matrix.length < 2) return { rows: [], errors: [{ row: 1, message: "No data rows after header." }] };

  const { headers, dataStartRow } = flattenDealHeaders(matrix);
  const colToKey: Record<number, keyof DealExcelRow> = {};
  const usedKeys = new Set<string>();

  headers.forEach((cell, i) => {
    const key = DEAL_HEADER_MAP[normHeader(cell)];
    if (!key) return;
    // Prefer the first mapping for ambiguous "Amount" columns already claimed
    if (usedKeys.has(key) && (key === "amountWithoutTax" || key === "amountPaid" || key === "nextInstallmentAmount")) {
      // allow later more-specific headers to win if current was generic — already assigned first
      return;
    }
    colToKey[i] = key;
    usedKeys.add(key);
  });

  // Disambiguate duplicate "Amount" columns when flattened poorly:
  // If we have totalWithGst but amountWithoutTax came from a later "Amount" under Annual Payment,
  // re-scan using position relative to known headers.
  const hasCustomer = Object.values(colToKey).includes("customerName");
  const hasTotal =
    Object.values(colToKey).includes("totalWithGst") || Object.values(colToKey).includes("amountWithoutTax");
  if (!hasCustomer || !hasTotal) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message:
            "Missing required columns. Need Customer Name/Company Name and Total Deal Value (Amount / With GST).",
        },
      ],
    };
  }

  const rows: { rowIndex: number; data: DealExcelRow }[] = [];
  const errors: ParseError[] = [];

  for (let r = dataStartRow; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line.some((c) => String(c).trim())) continue;
    const data: DealExcelRow = { ...EMPTY_ROW };
    Object.entries(colToKey).forEach(([ci, key]) => {
      const raw = line[Number(ci)];
      // Prefer formatted date strings from cellDates
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        data[key] = raw.toISOString().slice(0, 10);
      } else {
        data[key] = String(raw ?? "").trim();
      }
    });

    if (!data.customerName.trim()) {
      errors.push({ row: r + 1, message: "Customer Name / Company Name is required." });
      continue;
    }

    const withGst = parseMoney(data.totalWithGst);
    const withoutTax = parseMoney(data.amountWithoutTax);
    if ((withGst == null || withGst <= 0) && (withoutTax == null || withoutTax <= 0)) {
      errors.push({
        row: r + 1,
        message: "Total Deal Value (Amount or With GST) must be a positive number.",
      });
      continue;
    }

    // Align tax / totals when one side is missing
    if (withGst != null && withoutTax != null && !data.taxAmount.trim()) {
      data.taxAmount = String(Math.max(0, Math.round((withGst - withoutTax) * 100) / 100));
    } else if (withGst != null && withoutTax == null) {
      const tax = parseMoney(data.taxAmount);
      if (tax != null) data.amountWithoutTax = String(Math.max(0, Math.round((withGst - tax) * 100) / 100));
      else data.amountWithoutTax = String(withGst);
    } else if (withoutTax != null && withGst == null) {
      const tax = parseMoney(data.taxAmount) ?? 0;
      data.totalWithGst = String(Math.round((withoutTax + tax) * 100) / 100);
    }

    if (!data.serviceName.trim() && data.subscribedModules.trim()) {
      data.serviceName = data.subscribedModules.trim();
    }
    if (!data.invoiceNumber.trim() && data.clientId.trim()) {
      data.invoiceNumber = data.clientId.trim();
    }
    if (!data.invoiceDate.trim()) {
      data.invoiceDate = data.paidDate || data.sheetDate || data.startDate;
    }

    rows.push({ rowIndex: r + 1, data });
  }

  return { rows, errors };
}

export type DuplicateMode = "skip" | "overwrite";

export type AgentResolution = Record<string, string>; // sheet agent name (lower) → userId

export type BuildDealResult = {
  deal: Deal;
  rowIndex: number;
  clientId: string;
  salesAgentRaw: string;
  agentMatched: boolean;
  existingDealId: string | null;
};

type ApiCustomer = {
  id: string;
  name: string;
  customerName?: string | null;
  companyName?: string | null;
  regionId: string;
};

function customerDisplayName(c: ApiCustomer): string {
  return String(c.companyName || c.customerName || c.name || "").trim();
}

export function matchUserByName(users: User[], raw: string): User | undefined {
  const n = raw.trim().toLowerCase();
  if (!n) return undefined;
  return users.find((u) => u.name.trim().toLowerCase() === n && u.status !== "disabled");
}

export function matchTeamByName(teams: Team[], raw: string): Team | undefined {
  const n = raw.trim().toLowerCase();
  if (!n) return undefined;
  return teams.find((t) => t.name.trim().toLowerCase() === n);
}

export function findDuplicateDeal(
  existingDeals: Deal[],
  data: DealExcelRow,
  customerId: string,
): Deal | undefined {
  const clientId = data.clientId.trim() || data.invoiceNumber.trim();
  if (clientId) {
    const byInv = existingDeals.find(
      (d) => !d.deletedAt && String(d.invoiceNumber ?? "").trim().toLowerCase() === clientId.toLowerCase(),
    );
    if (byInv) return byInv;
  }
  const moduleName = (data.subscribedModules || data.serviceName || "").trim().toLowerCase();
  const start = parseDateCell(data.startDate);
  if (moduleName && start) {
    return existingDeals.find((d) => {
      if (d.deletedAt) return false;
      if (d.customerId !== customerId) return false;
      const svc = String(d.serviceName ?? "").trim().toLowerCase();
      const name = String(d.name ?? "").trim().toLowerCase();
      const moduleHit = svc === moduleName || name.includes(moduleName);
      // Soft match on start date in expectedCloseDate or createdAt when end is used for close
      return moduleHit && (d.createdAt?.slice(0, 10) === start || false);
    });
  }
  return undefined;
}

function mapCrmStatus(raw: string): { dealStatus: string; invoiceStatus: string | null } {
  const t = raw.trim();
  if (!t) return { dealStatus: "Active", invoiceStatus: null };
  const lower = t.toLowerCase();
  if ((DEAL_STATUSES as readonly string[]).includes(t)) {
    return { dealStatus: normalizeDealStatus(t), invoiceStatus: null };
  }
  if (lower === "paid" || lower === "closed won" || lower === "won") {
    return { dealStatus: "Closed/Won", invoiceStatus: t };
  }
  if (lower === "lost" || lower === "closed lost") {
    return { dealStatus: "Closed/Lost", invoiceStatus: t };
  }
  if (lower.includes("pending") || lower.includes("due") || lower.includes("partial")) {
    return { dealStatus: "Pending", invoiceStatus: t };
  }
  return { dealStatus: "Active", invoiceStatus: t };
}

function buildRemarks(data: DealExcelRow): string | null {
  const parts: string[] = [];
  if (data.remarks.trim()) parts.push(data.remarks.trim());
  if (data.clientId.trim()) parts.push(`CRM Client Id: ${data.clientId.trim()}`);
  if (data.startDate.trim() || data.endDate.trim()) {
    parts.push(`Subscription: ${data.startDate.trim() || "?"} → ${data.endDate.trim() || "?"}`);
  }
  if (data.licensesTotal.trim() || data.licensesActive.trim()) {
    parts.push(
      `Licenses: ${data.licensesTotal.trim() || "—"} total / ${data.licensesActive.trim() || "—"} active`,
    );
  }
  if (data.nextInstallmentAmount.trim() || data.nextDueDate.trim()) {
    parts.push(
      `Next installment: ${data.nextInstallmentAmount.trim() || "—"} due ${data.nextDueDate.trim() || "—"}` +
        (data.nextInvoiceGenerated.trim() ? ` (invoice: ${data.nextInvoiceGenerated.trim()})` : "") +
        (data.nextInstallmentRemarks.trim() ? ` — ${data.nextInstallmentRemarks.trim()}` : ""),
    );
  }
  return parts.length ? parts.join("\n") : null;
}

/**
 * Build deal payloads from parsed Excel rows.
 * Unmatched sales agents are left on `me` only if `agentResolution` provides a mapping
 * or `allowFallbackOwner` is true — otherwise those rows are returned with agentMatched=false
 * and should be resolved in the UI before save.
 */
export async function buildDealsFromExcelRows(
  parsed: { rowIndex: number; data: DealExcelRow }[],
  ctx: {
    me: MeContext;
    users: User[];
    teams: Team[];
    existingDeals: Deal[];
    agentResolution?: AgentResolution;
    /** When true, unmatched agents fall back to current user (legacy). Prefer false + UI mapping. */
    allowFallbackOwner?: boolean;
  },
): Promise<{ results: BuildDealResult[]; errors: ParseError[]; unmatchedAgents: string[] }> {
  const errors: ParseError[] = [];
  const results: BuildDealResult[] = [];
  const unmatchedSet = new Set<string>();
  const agentResolution = ctx.agentResolution ?? {};
  const allowFallbackOwner = ctx.allowFallbackOwner === true;

  let customers: ApiCustomer[] = [];
  try {
    const res = await fetch(apiUrl("/api/customers"));
    if (res.ok) customers = (await res.json()) as ApiCustomer[];
    else throw new Error("Failed");
  } catch {
    return {
      results: [],
      errors: [{ row: 0, message: "Failed to load customers from API." }],
      unmatchedAgents: [],
    };
  }

  const matchCustomer = (name: string): ApiCustomer | undefined => {
    const n = name.trim().toLowerCase();
    return customers.find((c) => customerDisplayName(c).toLowerCase() === n || String(c.name).trim().toLowerCase() === n);
  };

  const createCustomer = async (companyName: string): Promise<ApiCustomer | null> => {
    const body = {
      name: companyName.trim(),
      companyName: companyName.trim(),
      regionId: ctx.me.regionId,
      status: "active",
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
    let customer = matchCustomer(data.customerName);
    if (!customer) {
      const created = await createCustomer(data.customerName);
      if (!created) {
        errors.push({ row: rowIndex, message: "Customer not found and could not be created." });
        continue;
      }
      customer = created;
    }

    const totalWithGst = parseMoney(data.totalWithGst) ?? 0;
    let amountWithoutTax = parseMoney(data.amountWithoutTax) ?? 0;
    let taxAmount = parseMoney(data.taxAmount);
    if (taxAmount == null && totalWithGst > 0 && amountWithoutTax > 0) {
      taxAmount = Math.max(0, Math.round((totalWithGst - amountWithoutTax) * 100) / 100);
    }
    taxAmount = taxAmount ?? 0;
    if (amountWithoutTax <= 0 && totalWithGst > 0) {
      amountWithoutTax = Math.max(0, totalWithGst - taxAmount);
    }
    const total = totalWithGst > 0 ? totalWithGst : amountWithoutTax + taxAmount;
    const amountPaid = parseMoney(data.amountPaid) ?? 0;
    const balance =
      parseMoney(data.balanceDue) ?? Math.max(0, Math.round((total - amountPaid) * 100) / 100);

    const salesRaw = data.salesAgent.trim();
    const salesKey = salesRaw.toLowerCase();
    let owner: User | undefined;
    let agentMatched = true;
    if (salesRaw) {
      owner = matchUserByName(ctx.users, salesRaw);
      if (!owner && agentResolution[salesKey]) {
        owner = ctx.users.find((u) => u.id === agentResolution[salesKey]);
      }
      if (!owner) {
        agentMatched = false;
        unmatchedSet.add(salesRaw);
        if (!allowFallbackOwner && !agentResolution[salesKey]) {
          // Still build a preview deal owned by me, but flag for UI resolution
          owner = ctx.users.find((u) => u.id === ctx.me.id);
        } else {
          owner = ctx.users.find((u) => u.id === ctx.me.id);
        }
      }
    } else {
      owner = ctx.users.find((u) => u.id === ctx.me.id);
    }

    const teamFromSheet = matchTeamByName(ctx.teams, data.assignedTeam);
    const teamId = teamFromSheet?.id || owner?.teamId || ctx.me.teamId;
    const regionId = teamFromSheet
      ? ctx.teams.find((t) => t.id === teamFromSheet.id)?.regionId || owner?.regionId || ctx.me.regionId
      : owner?.regionId || ctx.me.regionId;

    const deliveryRaw = data.deliveryMember.trim();
    const deliveryUser = deliveryRaw ? matchUserByName(ctx.users, deliveryRaw) : undefined;

    const { dealStatus, invoiceStatus } = mapCrmStatus(data.status);
    const moduleName = (data.subscribedModules || data.serviceName || "").trim();
    const clientId = data.clientId.trim() || data.invoiceNumber.trim();
    const titleParts = [moduleName, clientId].filter(Boolean);
    const title = titleParts.length ? titleParts.join(" • ") : `Deal — ${data.customerName.trim()}`;

    const invoiceDate =
      parseDateCell(data.invoiceDate) ||
      parseDateCell(data.paidDate) ||
      parseDateCell(data.sheetDate) ||
      null;
    const endDate = parseDateCell(data.endDate);
    const nextDue = parseDateCell(data.nextDueDate);

    const existing = findDuplicateDeal(ctx.existingDeals, data, customer.id);

    const deal: Deal = {
      id: existing?.id ?? "pending",
      name: title,
      customerId: customer.id,
      ownerUserId: owner?.id || ctx.me.id,
      teamId,
      regionId,
      stage: existing?.stage || "Won",
      value: total,
      locked: false,
      proposalId: existing?.proposalId ?? null,
      dealStatus,
      deliveryAssigneeUserId: deliveryUser?.id ?? existing?.deliveryAssigneeUserId ?? null,
      deliveryAssigneeName: deliveryUser?.name ?? (deliveryRaw || existing?.deliveryAssigneeName) ?? null,
      invoiceStatus: invoiceStatus || data.status.trim() || existing?.invoiceStatus || null,
      invoiceDate,
      invoiceNumber: clientId || existing?.invoiceNumber || null,
      totalAmount: total,
      taxAmount,
      amountWithoutTax,
      placeOfSupply: data.placeOfSupply.trim() || existing?.placeOfSupply || null,
      balanceAmount: balance,
      amountPaid,
      serviceName: moduleName || existing?.serviceName || null,
      dealSource: existing?.dealSource ?? "CRM Import",
      expectedCloseDate: endDate || existing?.expectedCloseDate || null,
      priority: existing?.priority || "Medium",
      nextFollowUpDate: nextDue || existing?.nextFollowUpDate || null,
      lossReason: dealStatus === "Closed/Lost" ? existing?.lossReason || "Imported as lost" : null,
      contactPhone: existing?.contactPhone ?? null,
      remarks: buildRemarks(data),
    };

    results.push({
      deal,
      rowIndex,
      clientId,
      salesAgentRaw: salesRaw,
      agentMatched: !salesRaw || agentMatched,
      existingDealId: existing?.id ?? null,
    });
  }

  return { results, errors, unmatchedAgents: [...unmatchedSet].sort() };
}
