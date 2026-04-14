export type Role = 'super_admin' | 'finance' | 'sales_manager' | 'sales_rep' | 'support';

export type Module =
  | 'dashboard'
  | 'proposals'
  | 'deals'
  | 'customers'
  | 'automation'
  | 'users'
  | 'teams'
  | 'regions'
  | 'email_log'
  | 'masters'
  | 'inventory'
  | 'payments'
  | 'data_control_center';

export type Scope = 'ALL' | 'REGION' | 'TEAM' | 'SELF' | 'NONE';

export type Action =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'test'
  | 'approve'
  | 'reject'
  | 'send'
  | 'share'
  | 'export'
  | 'request_approval'
  | 'override_final_value'
  | 'admin_override'
  | 'manage_tickets';

export interface Region {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  regionId: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  /**
   * Demo-only plaintext password field.
   * In a real app this would be a hash managed by the backend.
   */
  password: string;
  role: Role;
  teamId: string;
  regionId: string;
  status: 'active' | 'disabled';
}

export type CustomerStatus =
  | 'active'
  | 'inactive'
  | 'lead'
  | 'churned'
  | 'blacklisted';

export interface CustomerContact {
  id: string;
  name: string;
  designation?: string;
  email: string;
  phone?: string;
  isPrimary: boolean;
}

export interface CustomerNote {
  id: string;
  content: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  uploadedBy: string;
  uploadedAt: string;
  url?: string;
}

export interface CustomerProductLine {
  id: string;
  inventoryItemId: string;
  itemName: string;
  sku: string;
  itemType: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
  purchasedAt: string;
  renewalDate?: string;
  expiryDate?: string;
  status: 'active' | 'expired' | 'cancelled';
  dealId: string;
  usageDetails?: string;
}

export interface CustomerPayment {
  id: string;
  dealId: string;
  dealTitle: string;
  amount: number;
  paidOn: string;
  mode: string;
  reference: string;
  notes?: string;
}

export interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  dealId: string;
  dealTitle: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  issuedOn: string;
  dueDate: string;
  status: 'paid' | 'unpaid' | 'overdue' | 'cancelled';
}

export interface CustomerSupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface CustomerActivityLog {
  id: string;
  action: string;
  description: string;
  performedBy: string;
  performedByName: string;
  timestamp: string;
  entityType?: string;
  entityId?: string;
}

export interface Customer {
  id: string;
  customerNumber: string;
  companyName: string;
  status: CustomerStatus;
  gstin?: string;
  pan?: string;
  industry?: string;
  website?: string;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country: string;
  };
  contacts: CustomerContact[];
  regionId: string;
  regionName: string;
  teamId: string;
  assignedTo: string;
  assignedToName: string;
  tags: string[];
  notes: CustomerNote[];
  attachments: CustomerAttachment[];
  productLines: CustomerProductLine[];
  payments: CustomerPayment[];
  invoices: CustomerInvoice[];
  supportTickets: CustomerSupportTicket[];
  activityLog: CustomerActivityLog[];
  totalRevenue: number;
  totalDealValue: number;
  activeProposalsCount: number;
  activeDealsCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type ItemType = 'product' | 'service' | 'subscription' | 'bundle';

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  itemType: ItemType;
  sku: string;
  hsnSacCode?: string;
  category: string;
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  taxRate: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes?: string;
}

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'approval_pending'
  | 'approved'
  | 'negotiation'
  | 'won'
  | 'cold'
  | 'rejected'
  | 'deal_created';

export interface ProposalLineItem {
  id: string;
  inventoryItemId: string;
  name: string;
  sku: string;
  description?: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  lineTotal: number;
  taxAmount: number;
}

export interface ProposalVersion {
  version: number;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  lineItems: ProposalLineItem[];
  /** Fixed charges added on top of computed totals (default 0). */
  setupDeploymentCharges: number;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  notes?: string;
}

export interface Proposal {
  id: string;
  proposalNumber: string;
  title: string;
  customerId: string;
  customerName: string;
  assignedTo: string;
  assignedToName: string;
  regionId: string;
  teamId: string;
  status: ProposalStatus;
  validUntil: string;
  lineItems: ProposalLineItem[];
  /** Fixed charges added on top of computed totals (default 0). */
  setupDeploymentCharges: number;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  finalQuoteValue?: number;
  versionHistory: ProposalVersion[];
  currentVersion: number;
  notes?: string;
  customerNotes?: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  sentAt?: string;
  dealId?: string;
  paymentTerms?: string;
}

export interface Deal {
  id: string;
  name: string;
  customerId: string;
  ownerUserId: string;
  teamId: string;
  regionId: string;
  stage: string;
  value: number;
  locked: boolean;
  proposalId: string | null;
  /** Deal status: Hot, Cold, Active, Pending, Closed/Won, Closed/Lost */
  dealStatus?: string;
  /** Invoice tracker fields (bulk upload template) */
  invoiceStatus?: string | null;
  invoiceDate?: string | null;
  invoiceNumber?: string | null;
  totalAmount?: number;
  taxAmount?: number;
  amountWithoutTax?: number;
  placeOfSupply?: string | null;
  balanceAmount?: number;
  amountPaid?: number;
  serviceName?: string | null;
  dealSource?: string | null;
  expectedCloseDate?: string | null;
  priority?: string;
  lastActivityAt?: string | null;
  nextFollowUpDate?: string | null;
  lossReason?: string | null;
  contactPhone?: string | null;
  remarks?: string | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** Soft delete — super admin can list deleted deals */
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  deletedByName?: string | null;
}

export type NotificationType = 'CUSTOMER_EMAIL' | 'INTERNAL_EMAIL' | 'AUDIT_EMAIL';

export interface Notification {
  id: string;
  type: NotificationType;
  to: string;
  subject: string;
  entityId: string;
  at: string;
}

export * from "./automation";

export interface MeContext {
  id: string;
  name: string;
  role: Role;
  teamId: string;
  regionId: string;
}

export type MasterType = 'product_category' | 'subscription_type' | 'proposal_format';

export interface MasterItem {
  id: string;
  name: string;
  type: MasterType;
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  finance: 'Finance',
  sales_manager: 'Sales Manager',
  sales_rep: 'Sales Rep',
  support: 'Support',
};
