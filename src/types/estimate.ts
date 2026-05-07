export type GSTType = "intra" | "inter";

export interface EstimateLineItem {
  id: string;
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number; // qty × rate
  taxRate: number; // 0 | 5 | 12 | 18 | 28
}

export interface EstimateData {
  estimateNumber: string;
  estimateDate: string; // ISO date

  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPincode: string;
  customerCountry: string;
  customerGstin?: string;
  customerStateCode: string;

  lineItems: EstimateLineItem[];
  gstType: GSTType;

  notes?: string;
  termsAndConditions?: string;
}

export interface TaxBreakdownRow {
  label: string;
  amount: number;
}

export interface EstimateTotals {
  subTotal: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  taxBreakdown: TaxBreakdownRow[];
  grandTotal: number;
}

