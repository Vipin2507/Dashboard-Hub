import * as XLSX from "xlsx";

/** Payload shape accepted by POST /api/customers/bulk */
export type CustomerBulkRow = {
  name: string;
  regionId: string;
  leadId?: string;
  state?: string;
  gstin?: string | null;
  city?: string | null;
  email?: string | null;
  primaryPhone?: string | null;
  status?: string;
  salesExecutive?: string | null;
  accountManager?: string | null;
  deliveryExecutive?: string | null;
};

export type ParseError = { row: number; message: string };

function normHeader(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Map common header aliases → canonical keys */
function headerToKey(h: string): string | null {
  const n = normHeader(h);
  const aliases: Record<string, string> = {
    "company name": "name",
    name: "name",
    "region id": "regionId",
    region: "regionId",
    city: "city",
    state: "state",
    email: "email",
    phone: "primaryPhone",
    "primary phone": "primaryPhone",
    mobile: "primaryPhone",
    status: "status",
    "lead id": "leadId",
    "lead id ": "leadId",
    gstin: "gstin",
    "sales executive": "salesExecutive",
    "account manager": "accountManager",
    "delivery executive": "deliveryExecutive",
  };
  return aliases[n] ?? null;
}

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

export function downloadCustomersTemplate(regions: { id: string; name: string }[]): void {
  const wb = XLSX.utils.book_new();

  const regionsSheet = XLSX.utils.aoa_to_sheet([
    ["Region ID", "Region name"],
    ...regions.map((r) => [r.id, r.name]),
  ]);
  XLSX.utils.book_append_sheet(wb, regionsSheet, "Regions");

  const headers = [
    "Company Name",
    "Region ID",
    "City",
    "State",
    "Email",
    "Phone",
    "Status",
    "Lead ID",
    "GSTIN",
    "Sales Executive",
  ];
  const example = [
    "Acme Pvt Ltd",
    regions[0]?.id ?? "r1",
    "Mumbai",
    "Maharashtra",
    "contact@acme.com",
    "9876543210",
    "lead",
    "L-1001",
    "",
    "",
  ];
  const customersSheet = XLSX.utils.aoa_to_sheet([headers, example]);
  XLSX.utils.book_append_sheet(wb, customersSheet, "Customers");

  XLSX.writeFile(wb, `customers-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseCustomersWorkbook(file: File): Promise<{ rows: CustomerBulkRow[]; errors: ParseError[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === "customers") ?? wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ row: 0, message: "Workbook has no sheets." }] };
  }
  const sheet = wb.Sheets[sheetName];
  const matrix = sheetToMatrix(sheet);
  if (matrix.length < 2) {
    return { rows: [], errors: [{ row: 1, message: "No data rows after header." }] };
  }

  const headerRow = matrix[0];
  const colIndex: Record<string, number> = {};
  headerRow.forEach((cell, i) => {
    const key = headerToKey(cell);
    if (key) colIndex[key] = i;
  });

  if (colIndex.name == null || colIndex.regionId == null) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: 'Missing required columns: need "Company Name" and "Region ID".',
        },
      ],
    };
  }

  const rows: CustomerBulkRow[] = [];
  const errors: ParseError[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line.some((c) => String(c).trim())) continue;

    const name = String(line[colIndex.name] ?? "").trim();
    const regionId = String(line[colIndex.regionId] ?? "").trim();
    if (!name || !regionId) {
      errors.push({ row: r + 1, message: "Company Name and Region ID are required." });
      continue;
    }

    const getCol = (key: string) => {
      const idx = colIndex[key];
      if (idx == null) return "";
      return String(line[idx] ?? "").trim();
    };

    rows.push({
      name,
      regionId,
      leadId: getCol("leadId") || undefined,
      state: getCol("state") || "Unknown",
      gstin: getCol("gstin") || null,
      city: getCol("city") || null,
      email: getCol("email") || null,
      primaryPhone: getCol("primaryPhone") || null,
      status: getCol("status") || "active",
      salesExecutive: getCol("salesExecutive") || null,
      accountManager: getCol("accountManager") || null,
      deliveryExecutive: getCol("deliveryExecutive") || null,
    });
  }

  return { rows, errors };
}
