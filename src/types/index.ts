export type Role = 'super_admin' | 'finance' | 'sales_manager' | 'sales_rep' | 'support';

export type Module = 'dashboard' | 'proposals' | 'deals' | 'customers' | 'users' | 'teams' | 'regions' | 'email_log' | 'masters' | 'inventory';

export type Scope = 'ALL' | 'REGION' | 'TEAM' | 'SELF' | 'NONE';

export type Action = 'view' | 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'send' | 'share' | 'export' | 'request_approval' | 'override_final_value' | 'admin_override';

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

export interface Customer {
  id: string;
  leadId: string;
  name: string;
  state: string;
  gstin: string | null;
  regionId: string;
  // Optional extended fields for richer dashboards
  city?: string;
  email?: string;
  primaryPhone?: string;
  status?: 'active' | 'inactive';
  createdAt?: string;
  salesExecutive?: string;
  accountManager?: string;
  deliveryExecutive?: string;
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
  lineItems: ProposalLineItem[];
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
