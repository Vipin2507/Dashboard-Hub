import type { GSTType } from "@/types/estimate";

export const COMPANY = {
  name: "Cravingcode Technologies Pvt Ltd",
  address1: "Akshar Business Park, Office Number 89 / Wing Z",
  address2: "Sector 25, Turbhe",
  city: "Navi Mumbai",
  state: "Maharashtra",
  pincode: "400703",
  country: "India",
  gstin: "27AAHCC0618G1ZX",
  stateCode: "27",
  bankName: "Yes Bank",
  accountName: "Cravingcode Technologies Pvt Ltd",
  accountNo: "024863700001802",
  branch: "APMC Vashi Navi Mumbai",
  ifsc: "YESB0000248",
} as const;

export const ESTIMATE_DEFAULTS = {
  notes: "Looking forward for your business.",
  terms:
    "For Online Transfer / NEFT / RTGS use the following details \n" +
    "Bank Name: Yes Bank\n" +
    "Account Name: Cravingcode Technologies Pvt Ltd\n" +
    "Account No: 024863700001802\n" +
    "Branch: APMC Vashi Navi Mumbai \n" +
    "IFSC: YESB0000248",
} as const;

export const STATE_CODES: Record<string, string> = {
  "27": "Maharashtra",
  "06": "Haryana",
  "07": "Delhi",
  "29": "Karnataka",
  "33": "Tamil Nadu",
  "36": "Telangana",
  "09": "Uttar Pradesh",
  "19": "West Bengal",
  "08": "Rajasthan",
};

export function determineGSTType(customerStateCode: string): GSTType {
  return String(customerStateCode || "").trim() === COMPANY.stateCode ? "intra" : "inter";
}

export function getStateCodeFromGSTIN(gstin: string): string {
  return String(gstin || "").substring(0, 2) || "";
}

