import * as XLSX from "xlsx";
import type { Deal, MeContext } from "@/types";
import { apiUrl } from "@/lib/api";

export type ParseError = { row: number; message: string };

function normHeader(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Maps normalized header → field key */
const DEAL_HEADER_MAP: Record<string, keyof DealExcelRow> = {
  status: "status",
  "invoice date": "invoiceDate",
  "invoice#": "invoiceNumber",
  "invoice #": "invoiceNumber",
  "invoice no": "invoiceNumber",
  "invoice no.": "invoiceNumber",
  "invoice number": "invoiceNumber",
  "customer name": "customerName",
  total: "total",
  "tax amount": "taxAmount",
  "amount without tax": "amountWithoutTax",
  "place of supply": "placeOfSupply",
  balance: "balance",
  "amount paid": "amountPaid",
  service: "serviceName",
};

export type DealExcelRow = {
  status: string;
  invoiceDate: string;
  invoiceNumber: string;
  customerName: string;
  total: string;
  taxAmount: string;
  amountWithoutTax: string;
  placeOfSupply: string;
  balance: string;
  amountPaid: string;
  serviceName: string;
};

const EMPTY_ROW: DealExcelRow = {
  status: "",
  invoiceDate: "",
  invoiceNumber: "",
  customerName: "",
  total: "",
  taxAmount: "",
  amountWithoutTax: "",
  placeOfSupply: "",
  balance: "",
  amountPaid: "",
  serviceName: "",
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

function parseMoney(raw: string): number | null {
  const cleaned = String(raw ?? "")
    .replace(/₹/g, "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDateCell(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  // If already ISO-ish date
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const n = Number(t);
  const xlsxAny = XLSX as unknown as { SSF?: { parse_date_code?: (code: number) => { y: number; m: number; d: number } } };
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

  const headers = [
    "Status",
    "Invoice Date",
    "Invoice#",
    "Customer Name",
    "Total",
    "Tax Amount",
    "Amount Without Tax",
    "Place of Supply",
    "Balance",
    "Amount Paid",
    "Service",
  ];

  const example = [
    "Paid",
    "2025-11-01",
    "CCT-1188",
    "SPOTLIGHT FINANCE AND CONSULTANCY PVT LTD",
    "118000",
    "18000",
    "100000",
    "West Bengal",
    "0",
    "118000",
    "ERP",
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  XLSX.utils.book_append_sheet(wb, sheet, "Deals");
  XLSX.writeFile(wb, `deals-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseDealsWorkbook(file: File): Promise<{
  rows: { rowIndex: number; data: DealExcelRow }[];
  errors: ParseError[];
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "deals") ?? wb.SheetNames[0];
  if (!sheetName) return { rows: [], errors: [{ row: 0, message: "Workbook has no sheets." }] };

  const matrix = sheetToMatrix(wb.Sheets[sheetName]);
  if (matrix.length < 2) return { rows: [], errors: [{ row: 1, message: "No data rows after header." }] };

  const headerRow = matrix[0];
  const colToKey: Record<number, keyof DealExcelRow> = {};
  headerRow.forEach((cell, i) => {
    const key = DEAL_HEADER_MAP[normHeader(cell)];
    if (key) colToKey[i] = key;
  });

  const required: (keyof DealExcelRow)[] = ["customerName", "total"];
  const missing = required.filter((k) => !Object.values(colToKey).includes(k));
  if (missing.length) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `Missing required columns: Customer Name, Total.`,
        },
      ],
    };
  }

  const rows: { rowIndex: number; data: DealExcelRow }[] = [];
  const errors: ParseError[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line.some((c) => String(c).trim())) continue;
    const data: DealExcelRow = { ...EMPTY_ROW };
    Object.entries(colToKey).forEach(([ci, key]) => {
      data[key] = String(line[Number(ci)] ?? "").trim();
    });

    if (!data.customerName.trim()) {
      errors.push({ row: r + 1, message: "Customer Name is required." });
      continue;
    }
    const total = parseMoney(data.total);
    if (total == null || total <= 0) {
      errors.push({ row: r + 1, message: "Total must be a positive number." });
      continue;
    }

    rows.push({ rowIndex: r + 1, data });
  }

  return { rows, errors };
}

type ApiCustomer = { id: string; name: string; regionId: string };

export async function buildDealsFromExcelRows(
  parsed: { rowIndex: number; data: DealExcelRow }[],
  ctx: { me: MeContext },
): Promise<{ deals: Deal[]; errors: ParseError[] }> {
  const errors: ParseError[] = [];
  const deals: Deal[] = [];

  let customers: ApiCustomer[] = [];
  try {
    const res = await fetch(apiUrl("/api/customers"));
    if (res.ok) customers = (await res.json()) as ApiCustomer[];
    else throw new Error("Failed");
  } catch {
    return { deals: [], errors: [{ row: 0, message: "Failed to load customers from API." }] };
  }

  const matchCustomer = (name: string): ApiCustomer | undefined => {
    const n = name.trim().toLowerCase();
    return customers.find((c) => String(c.name ?? "").trim().toLowerCase() === n);
  };

  const createCustomer = async (companyName: string): Promise<ApiCustomer | null> => {
    const body = { name: companyName.trim(), regionId: ctx.me.regionId, status: "active", state: "Unknown" };
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

    const total = parseMoney(data.total) ?? 0;
    const taxAmount = parseMoney(data.taxAmount) ?? 0;
    const amountWithoutTax = parseMoney(data.amountWithoutTax) ?? 0;
    const amountPaid = parseMoney(data.amountPaid) ?? 0;
    const balance = parseMoney(data.balance) ?? Math.max(0, total - amountPaid);

    const invoiceDate = parseDateCell(data.invoiceDate);
    const nameParts = [data.serviceName.trim(), data.invoiceNumber.trim()].filter(Boolean);
    const title = nameParts.length ? nameParts.join(" • ") : `Deal — ${data.customerName.trim()}`;

    const deal: Deal = {
      id: "pending",
      name: title,
      customerId: customer.id,
      ownerUserId: ctx.me.id,
      teamId: ctx.me.teamId,
      regionId: ctx.me.regionId,
      stage: "Qualified",
      value: total,
      locked: false,
      proposalId: null,
      dealStatus: "Active",
      invoiceStatus: data.status.trim() || null,
      invoiceDate: invoiceDate,
      invoiceNumber: data.invoiceNumber.trim() || null,
      totalAmount: total,
      taxAmount,
      amountWithoutTax,
      placeOfSupply: data.placeOfSupply.trim() || null,
      balanceAmount: balance,
      amountPaid,
      serviceName: data.serviceName.trim() || null,
      dealSource: null,
      expectedCloseDate: null,
      priority: "Medium",
      nextFollowUpDate: null,
      lossReason: null,
      contactPhone: null,
      remarks: null,
    };

    deals.push(deal);
  }

  return { deals, errors };
}

