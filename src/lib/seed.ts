import type {
  Region,
  Team,
  User,
  Customer,
  CustomerContact,
  CustomerNote,
  CustomerAttachment,
  CustomerProductLine,
  CustomerPayment,
  CustomerInvoice,
  CustomerSupportTicket,
  CustomerActivityLog,
  Proposal,
  Deal,
  Notification,
  InventoryItem,
  ProposalLineItem,
  ProposalVersion,
  AutomationTemplate,
} from '@/types';

export const seedRegions: Region[] = [
  { id: 'r1', name: 'North' },
  { id: 'r2', name: 'West' },
  { id: 'r3', name: 'South' },
  { id: 'r4', name: 'East' },
];

export const seedTeams: Team[] = [
  { id: 't1', name: 'Sales Team', regionId: 'r2' },
];

export const seedUsers: User[] = [
  { id: 'u1', name: 'Mohit Singht (admin)', email: 'mohit.singht@buildesk.com', password: 'admin123', role: 'super_admin', teamId: 't1', regionId: 'r2', status: 'active' },
  { id: 'u2', name: 'Vaibhav Agrawal (Sales Executive)', email: 'vaibhav.agrawal@buildesk.com', password: 'sales123', role: 'sales_rep', teamId: 't1', regionId: 'r2', status: 'active' },
  { id: 'u3', name: 'Shubham Behera (Sale Executive)', email: 'shubham.behera@buildesk.com', password: 'sales123', role: 'sales_rep', teamId: 't1', regionId: 'r2', status: 'active' },
  { id: 'u4', name: 'Sharad VS (Sale Executive)', email: 'sharad.vs@buildesk.com', password: 'sales123', role: 'sales_rep', teamId: 't1', regionId: 'r2', status: 'active' },
  { id: 'u5', name: 'Wasim Mondel (Sale Executive)', email: 'wasim.mondel@buildesk.com', password: 'sales123', role: 'sales_rep', teamId: 't1', regionId: 'r2', status: 'active' },
  { id: 'u6', name: 'Dylan David (Sale Executive)', email: 'dylan.david@buildesk.com', password: 'sales123', role: 'sales_rep', teamId: 't1', regionId: 'r2', status: 'active' },
  { id: 'u7', name: 'Bhumit Fluria (Sale Executive)', email: 'bhumit.fluria@buildesk.com', password: 'sales123', role: 'sales_rep', teamId: 't1', regionId: 'r2', status: 'active' },
  { id: 'u8', name: 'Preeti Rai (Pre-sales agent)', email: 'preeti.rai@buildesk.com', password: 'sales123', role: 'sales_rep', teamId: 't1', regionId: 'r2', status: 'active' },
];

const defaultAddress = { country: 'India' as const };

export const seedCustomers: Customer[] = [
  {
    id: 'c1',
    customerNumber: 'CUST-0001',
    companyName: 'Sunrise Developers Pvt Ltd',
    status: 'active',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    industry: 'Technology',
    website: 'https://sunrise.dev',
    address: { line1: 'Tower A, 5th Floor', line2: 'Bandra Kurla Complex', city: 'Mumbai', state: 'Maharashtra', pincode: '400051', ...defaultAddress },
    contacts: [
      { id: 'cc1', name: 'Rajesh Kumar', designation: 'CTO', email: 'rajesh@sunrise.dev', phone: '+91 98765 43210', isPrimary: true },
      { id: 'cc2', name: 'Priya Sharma', designation: 'Finance Head', email: 'priya@sunrise.dev', phone: '+91 98765 43211', isPrimary: false },
    ],
    regionId: 'r2',
    regionName: 'West',
    teamId: 't1',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    tags: ['enterprise', 'renewal'],
    notes: [
      { id: 'cn1', content: 'Annual renewal due in April. Discount approved.', createdBy: 'u4', createdByName: 'Amit (Sales Rep)', createdAt: '2026-03-10T10:00:00Z', updatedAt: '2026-03-10T10:00:00Z' },
    ],
    attachments: [
      { id: 'ca1', fileName: 'MSA-2026.pdf', fileType: 'pdf', fileSize: '1.2 MB', uploadedBy: 'u4', uploadedAt: '2026-03-01T12:00:00Z' },
    ],
    productLines: [
      { id: 'cpl1', inventoryItemId: 'inv1', itemName: 'Buildesk CRM Pro', sku: 'CRM-PRO-001', itemType: 'product', qty: 20, unitPrice: 14500, taxRate: 18, purchasedAt: '2026-03-09T00:00:00Z', renewalDate: '2027-03-09', status: 'active', dealId: 'd1', usageDetails: '18 of 20 licenses used' },
      { id: 'cpl2', inventoryItemId: 'inv5', itemName: 'Support & AMC Monthly', sku: 'SUB-AMC-MON', itemType: 'subscription', qty: 12, unitPrice: 5000, taxRate: 18, purchasedAt: '2026-03-09T00:00:00Z', renewalDate: '2027-03-09', expiryDate: '2027-03-09', status: 'active', dealId: 'd1' },
    ],
    payments: [
      { id: 'cp1', dealId: 'd1', dealTitle: 'CRM+ERP Renewal 2026', amount: 385000, paidOn: '2026-03-12', mode: 'bank_transfer', reference: 'UTR20260312123456', notes: 'Full payment received' },
    ],
    invoices: [
      { id: 'ci1', invoiceNumber: 'INV-2026-0012', dealId: 'd1', dealTitle: 'CRM+ERP Renewal 2026', amount: 326271, taxAmount: 58729, totalAmount: 385000, issuedOn: '2026-03-10', dueDate: '2026-03-25', status: 'paid' },
    ],
    supportTickets: [
      { id: 'cst1', ticketNumber: 'TKT-0042', subject: 'API rate limit increase', description: 'Need higher API rate limit for production.', status: 'resolved', priority: 'medium', createdBy: 'u4', createdByName: 'Amit (Sales Rep)', assignedTo: 'u6', assignedToName: 'Kiran (Support)', createdAt: '2026-03-08T09:00:00Z', updatedAt: '2026-03-09T14:00:00Z', resolvedAt: '2026-03-09T14:00:00Z' },
    ],
    activityLog: [
      { id: 'cal1', action: 'Deal closed', description: 'Deal d1 (CRM+ERP Renewal 2026) closed. Value ₹3,85,000.', performedBy: 'u4', performedByName: 'Amit (Sales Rep)', timestamp: '2026-03-09T15:00:00Z', entityType: 'deal', entityId: 'd1' },
      { id: 'cal2', action: 'Payment received', description: '₹3,85,000 received via bank transfer. UTR20260312123456', performedBy: 'u2', performedByName: 'Neha (Finance)', timestamp: '2026-03-12T11:00:00Z', entityType: 'payment', entityId: 'cp1' },
    ],
    totalRevenue: 385000,
    totalDealValue: 385000,
    activeProposalsCount: 2,
    activeDealsCount: 1,
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-12T10:00:00Z',
    createdBy: 'u4',
  },
  {
    id: 'c2',
    customerNumber: 'CUST-0002',
    companyName: 'Greenfield Realty Ltd',
    status: 'active',
    gstin: '24AABCG1234F1Z1',
    pan: 'AABCG1234F',
    industry: 'Real Estate',
    website: 'https://greenfieldrealty.in',
    address: { line1: 'Satellite Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015', ...defaultAddress },
    contacts: [
      { id: 'cc3', name: 'Vikram Mehta', designation: 'MD', email: 'vikram@greenfieldrealty.in', phone: '+91 98250 11223', isPrimary: true },
      { id: 'cc4', name: 'Anita Patel', designation: 'CFO', email: 'anita@greenfieldrealty.in', isPrimary: false },
    ],
    regionId: 'r2',
    regionName: 'West',
    teamId: 't1',
    assignedTo: 'u5',
    assignedToName: 'Sana (Sales Rep)',
    tags: ['enterprise'],
    notes: [],
    attachments: [],
    productLines: [],
    payments: [],
    invoices: [],
    supportTickets: [
      { id: 'cst2', ticketNumber: 'TKT-0043', subject: 'Onboarding support', description: 'Need help with initial setup.', status: 'in_progress', priority: 'high', createdBy: 'u5', createdByName: 'Sana (Sales Rep)', assignedTo: 'u6', assignedToName: 'Kiran (Support)', createdAt: '2026-03-11T10:00:00Z', updatedAt: '2026-03-12T09:00:00Z' },
    ],
    activityLog: [
      { id: 'cal3', action: 'Proposal created', description: 'Proposal PROP-2026-0042 created for ERP Implementation.', performedBy: 'u5', performedByName: 'Sana (Sales Rep)', timestamp: '2026-03-11T09:00:00Z', entityType: 'proposal', entityId: 'p2' },
    ],
    totalRevenue: 0,
    totalDealValue: 220000,
    activeProposalsCount: 1,
    activeDealsCount: 1,
    createdAt: '2026-03-05T11:30:00Z',
    updatedAt: '2026-03-12T09:00:00Z',
    createdBy: 'u5',
  },
  {
    id: 'c3',
    customerNumber: 'CUST-0003',
    companyName: 'NorthStar Builders & Associates',
    status: 'inactive',
    gstin: '07AABCN1234F1Z5',
    pan: 'AABCN1234F',
    industry: 'Real Estate',
    address: { line1: 'Connaught Place', city: 'New Delhi', state: 'Delhi', pincode: '110001', ...defaultAddress },
    contacts: [
      { id: 'cc5', name: 'Sanjay Gupta', designation: 'Director', email: 'sanjay@northstarbuilders.com', phone: '+91 98111 22334', isPrimary: true },
    ],
    regionId: 'r1',
    regionName: 'North',
    teamId: 't1',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    tags: [],
    notes: [],
    attachments: [],
    productLines: [],
    payments: [],
    invoices: [],
    supportTickets: [],
    activityLog: [
      { id: 'cal4', action: 'Customer marked inactive', description: 'Contract paused. Awaiting renewal decision.', performedBy: 'u3', performedByName: 'Ravi (Sales Manager)', timestamp: '2026-02-25T14:00:00Z', entityType: 'contact', entityId: 'c3' },
    ],
    totalRevenue: 0,
    totalDealValue: 0,
    activeProposalsCount: 1,
    activeDealsCount: 0,
    createdAt: '2026-02-20T09:15:00Z',
    updatedAt: '2026-02-25T14:00:00Z',
    createdBy: 'u4',
  },
  {
    id: 'c4',
    customerNumber: 'CUST-0004',
    companyName: 'TechVista Solutions',
    status: 'lead',
    industry: 'Technology',
    website: 'https://techvista.in',
    address: { line1: 'HSR Layout', city: 'Bengaluru', state: 'Karnataka', pincode: '560102', ...defaultAddress },
    contacts: [
      { id: 'cc6', name: 'Kavitha Reddy', designation: 'VP Engineering', email: 'kavitha@techvista.in', phone: '+91 99000 55443', isPrimary: true },
    ],
    regionId: 'r2',
    regionName: 'West',
    teamId: 't1',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    tags: ['pilot'],
    notes: [
      { id: 'cn2', content: 'Demo scheduled for next week. Interested in CRM + Analytics.', createdBy: 'u4', createdByName: 'Amit (Sales Rep)', createdAt: '2026-03-12T08:00:00Z', updatedAt: '2026-03-12T08:00:00Z' },
    ],
    attachments: [],
    productLines: [],
    payments: [],
    invoices: [],
    supportTickets: [],
    activityLog: [
      { id: 'cal5', action: 'Lead created', description: 'Customer created from website inquiry.', performedBy: 'u4', performedByName: 'Amit (Sales Rep)', timestamp: '2026-03-12T08:00:00Z', entityType: 'contact', entityId: 'c4' },
    ],
    totalRevenue: 0,
    totalDealValue: 0,
    activeProposalsCount: 0,
    activeDealsCount: 0,
    createdAt: '2026-03-12T08:00:00Z',
    updatedAt: '2026-03-12T08:00:00Z',
    createdBy: 'u4',
  },
  {
    id: 'c5',
    customerNumber: 'CUST-0005',
    companyName: 'MedCare Hospitals Ltd',
    status: 'active',
    gstin: '29AABCM5678F1Z9',
    industry: 'Healthcare',
    website: 'https://medcarehospitals.com',
    address: { line1: 'Jubilee Hills', city: 'Hyderabad', state: 'Telangana', pincode: '500033', ...defaultAddress },
    contacts: [
      { id: 'cc7', name: 'Dr. Suresh Rao', designation: 'CIO', email: 'suresh@medcare.com', phone: '+91 98480 99887', isPrimary: true },
      { id: 'cc8', name: 'Lakshmi Nair', designation: 'Procurement', email: 'lakshmi@medcare.com', isPrimary: false },
    ],
    regionId: 'r2',
    regionName: 'West',
    teamId: 't1',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    tags: ['healthcare', 'enterprise'],
    notes: [],
    attachments: [],
    productLines: [
      { id: 'cpl3', inventoryItemId: 'inv2', itemName: 'ERP Integration Service', sku: 'SVC-ERP-001', itemType: 'service', qty: 80, unitPrice: 2500, taxRate: 18, purchasedAt: '2025-06-01T00:00:00Z', status: 'active', dealId: 'dx', usageDetails: 'Implementation completed' },
    ],
    payments: [
      { id: 'cp2', dealId: 'dx', dealTitle: 'ERP Implementation 2025', amount: 200000, paidOn: '2025-07-15', mode: 'cheque', reference: 'CHQ-789012', notes: 'Advance payment' },
    ],
    invoices: [
      { id: 'ci2', invoiceNumber: 'INV-2025-0089', dealId: 'dx', dealTitle: 'ERP Implementation 2025', amount: 169492, taxAmount: 30508, totalAmount: 200000, issuedOn: '2025-07-01', dueDate: '2025-07-30', status: 'paid' },
    ],
    supportTickets: [],
    activityLog: [],
    totalRevenue: 200000,
    totalDealValue: 200000,
    activeProposalsCount: 0,
    activeDealsCount: 0,
    createdAt: '2025-05-15T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    createdBy: 'u4',
  },
  {
    id: 'c6',
    customerNumber: 'CUST-0006',
    companyName: 'RetailMax India',
    status: 'churned',
    gstin: '27AABCR5678F1Z2',
    industry: 'Retail',
    address: { city: 'Pune', state: 'Maharashtra', pincode: '411001', ...defaultAddress },
    contacts: [
      { id: 'cc9', name: 'Manoj Deshpande', designation: 'Operations Head', email: 'manoj@retailmax.in', isPrimary: true },
    ],
    regionId: 'r2',
    regionName: 'West',
    teamId: 't1',
    assignedTo: 'u5',
    assignedToName: 'Sana (Sales Rep)',
    tags: ['churned'],
    notes: [
      { id: 'cn3', content: 'Moved to competitor. Contract ended Dec 2025.', createdBy: 'u5', createdByName: 'Sana (Sales Rep)', createdAt: '2025-12-20T16:00:00Z', updatedAt: '2025-12-20T16:00:00Z' },
    ],
    attachments: [],
    productLines: [],
    payments: [],
    invoices: [],
    supportTickets: [],
    activityLog: [
      { id: 'cal6', action: 'Customer churned', description: 'Contract terminated. Switched to competitor.', performedBy: 'u5', performedByName: 'Sana (Sales Rep)', timestamp: '2025-12-20T16:00:00Z', entityType: 'deal', entityId: 'c6' },
    ],
    totalRevenue: 450000,
    totalDealValue: 450000,
    activeProposalsCount: 0,
    activeDealsCount: 0,
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2025-12-20T16:00:00Z',
    createdBy: 'u5',
  },
  {
    id: 'c7',
    customerNumber: 'CUST-0007',
    companyName: 'EduLearn Academy',
    status: 'lead',
    industry: 'Education',
    website: 'https://edulearn.academy',
    address: { line1: 'Salt Lake', city: 'Kolkata', state: 'West Bengal', pincode: '700091', ...defaultAddress },
    contacts: [
      { id: 'cc10', name: 'Debolina Sen', designation: 'Principal', email: 'debolina@edulearn.academy', phone: '+91 93333 44556', isPrimary: true },
    ],
    regionId: 'r2',
    regionName: 'West',
    teamId: 't1',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    tags: ['education', 'lead'],
    notes: [],
    attachments: [],
    productLines: [],
    payments: [],
    invoices: [],
    supportTickets: [],
    activityLog: [
      { id: 'cal7', action: 'Customer created', description: 'Customer created by Amit (Sales Rep)', performedBy: 'u4', performedByName: 'Amit (Sales Rep)', timestamp: '2026-03-10T11:00:00Z', entityType: 'contact', entityId: 'c7' },
    ],
    totalRevenue: 0,
    totalDealValue: 0,
    activeProposalsCount: 0,
    activeDealsCount: 0,
    createdAt: '2026-03-10T11:00:00Z',
    updatedAt: '2026-03-10T11:00:00Z',
    createdBy: 'u4',
  },
  {
    id: 'c8',
    customerNumber: 'CUST-0008',
    companyName: 'Prime Constructions',
    status: 'blacklisted',
    gstin: '09AABCP1234F1Z0',
    industry: 'Real Estate',
    address: { city: 'Noida', state: 'Uttar Pradesh', pincode: '201301', ...defaultAddress },
    contacts: [
      { id: 'cc11', name: 'Arun Verma', designation: 'Accounts', email: 'arun@primeconstructions.in', isPrimary: true },
    ],
    regionId: 'r1',
    regionName: 'North',
    teamId: 't1',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    tags: ['blacklisted', 'payment-default'],
    notes: [
      { id: 'cn4', content: 'Multiple payment defaults. Legal notice sent.', createdBy: 'u1', createdByName: 'Mohit (Admin)', createdAt: '2026-02-01T10:00:00Z', updatedAt: '2026-02-01T10:00:00Z' },
    ],
    attachments: [],
    productLines: [],
    payments: [],
    invoices: [
      { id: 'ci3', invoiceNumber: 'INV-2025-0156', dealId: 'dy', dealTitle: 'Legacy Project', amount: 150000, taxAmount: 27000, totalAmount: 177000, issuedOn: '2025-11-01', dueDate: '2025-11-30', status: 'overdue' },
    ],
    supportTickets: [],
    activityLog: [
      { id: 'cal8', action: 'Customer blacklisted', description: 'Blacklisted due to non-payment. Do not extend credit.', performedBy: 'u1', performedByName: 'Mohit (Admin)', timestamp: '2026-02-01T10:00:00Z', entityType: 'contact', entityId: 'c8' },
    ],
    totalRevenue: 0,
    totalDealValue: 177000,
    activeProposalsCount: 0,
    activeDealsCount: 0,
    createdAt: '2025-08-01T09:00:00Z',
    updatedAt: '2026-02-01T10:00:00Z',
    createdBy: 'u4',
  },
];

function makeLineItem(
  id: string,
  invId: string,
  name: string,
  sku: string,
  qty: number,
  unitPrice: number,
  taxRate: number,
  discount = 0
): ProposalLineItem {
  const lineTotal = qty * unitPrice * (1 - discount / 100);
  const taxAmount = (lineTotal * taxRate) / 100;
  return { id, inventoryItemId: invId, name, sku, qty, unitPrice, taxRate, discount, lineTotal, taxAmount };
}

const pNow = '2026-03-12T10:00:00Z';
function pVersions(
  lineItems: ProposalLineItem[],
  setupDeploymentCharges: number,
  subtotal: number,
  totalDiscount: number,
  totalTax: number,
  grandTotal: number,
): ProposalVersion[] {
  return [{ version: 1, createdAt: pNow, createdBy: 'u4', lineItems, setupDeploymentCharges, subtotal, totalDiscount, totalTax, grandTotal }];
}

export const seedProposals: Proposal[] = [
  {
    id: 'p1',
    proposalNumber: 'PROP-2026-0041',
    title: 'Enterprise CRM + Analytics Bundle',
    customerId: 'c1',
    customerName: 'Sunrise Developers',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    regionId: 'r2',
    teamId: 't1',
    status: 'sent',
    validUntil: '2026-04-15',
    lineItems: [
      makeLineItem('li1', 'inv1', 'Buildesk CRM Pro', 'CRM-PRO-001', 10, 15000, 18),
      makeLineItem('li2', 'inv3', 'Analytics Add-on Annual', 'SUB-ANAL-ANN', 1, 42000, 18),
    ],
    setupDeploymentCharges: 0,
    subtotal: 192000,
    totalDiscount: 0,
    totalTax: 34560,
    grandTotal: 226560,
    finalQuoteValue: 222000,
    versionHistory: pVersions(
      [makeLineItem('li1', 'inv1', 'Buildesk CRM Pro', 'CRM-PRO-001', 10, 15000, 18), makeLineItem('li2', 'inv3', 'Analytics Add-on Annual', 'SUB-ANAL-ANN', 1, 42000, 18)],
      0,
      192000, 0, 34560, 226560
    ),
    currentVersion: 1,
    customerNotes: 'Thank you for your business.',
    createdAt: '2026-03-08T10:00:00Z',
    updatedAt: '2026-03-10T14:00:00Z',
    createdBy: 'u4',
    approvedBy: 'u3',
    approvedAt: '2026-03-10T14:30:00Z',
    sentAt: '2026-03-10T15:00:00Z',
  },
  {
    id: 'p2',
    proposalNumber: 'PROP-2026-0042',
    title: 'ERP Implementation & Support',
    customerId: 'c2',
    customerName: 'Greenfield Realty',
    assignedTo: 'u5',
    assignedToName: 'Sana (Sales Rep)',
    regionId: 'r2',
    teamId: 't1',
    status: 'approval_pending',
    validUntil: '2026-04-20',
    lineItems: [
      makeLineItem('li3', 'inv2', 'ERP Integration Service', 'SVC-ERP-001', 40, 2500, 18),
      makeLineItem('li4', 'inv5', 'Support & AMC Monthly', 'SUB-AMC-MON', 12, 5500, 18),
    ],
    setupDeploymentCharges: 0,
    subtotal: 166000,
    totalDiscount: 0,
    totalTax: 29880,
    grandTotal: 195880,
    versionHistory: pVersions(
      [makeLineItem('li3', 'inv2', 'ERP Integration Service', 'SVC-ERP-001', 40, 2500, 18), makeLineItem('li4', 'inv5', 'Support & AMC Monthly', 'SUB-AMC-MON', 12, 5500, 18)],
      0,
      166000, 0, 29880, 195880
    ),
    currentVersion: 1,
    createdAt: '2026-03-11T09:00:00Z',
    updatedAt: '2026-03-12T11:00:00Z',
    createdBy: 'u5',
  },
  {
    id: 'p3',
    proposalNumber: 'PROP-2026-0043',
    title: 'Full Stack License Deal',
    customerId: 'c1',
    customerName: 'Sunrise Developers',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    regionId: 'r2',
    teamId: 't1',
    status: 'approved',
    validUntil: '2026-04-30',
    lineItems: [makeLineItem('li5', 'inv4', 'Enterprise Bundle', 'BND-ENT-001', 1, 320000, 18, 5)],
    setupDeploymentCharges: 0,
    subtotal: 304000,
    totalDiscount: 16000,
    totalTax: 54720,
    grandTotal: 342720,
    versionHistory: pVersions(
      [makeLineItem('li5', 'inv4', 'Enterprise Bundle', 'BND-ENT-001', 1, 320000, 18, 5)],
      0,
      304000, 16000, 54720, 342720
    ),
    currentVersion: 1,
    approvedBy: 'u3',
    approvedAt: '2026-03-13T10:00:00Z',
    createdAt: '2026-03-12T14:00:00Z',
    updatedAt: '2026-03-13T10:00:00Z',
    createdBy: 'u4',
  },
  {
    id: 'p4',
    proposalNumber: 'PROP-2026-0044',
    title: 'CRM Lite Pilot',
    customerId: 'c3',
    customerName: 'NorthStar Builders',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    regionId: 'r1',
    teamId: 't1',
    status: 'draft',
    validUntil: '2026-05-01',
    lineItems: [makeLineItem('li6', 'inv1', 'Buildesk CRM Pro', 'CRM-PRO-001', 5, 15000, 18)],
    setupDeploymentCharges: 0,
    subtotal: 75000,
    totalDiscount: 0,
    totalTax: 13500,
    grandTotal: 88500,
    versionHistory: pVersions([makeLineItem('li6', 'inv1', 'Buildesk CRM Pro', 'CRM-PRO-001', 5, 15000, 18)], 0, 75000, 0, 13500, 88500),
    currentVersion: 1,
    createdAt: '2026-03-13T09:00:00Z',
    updatedAt: '2026-03-13T09:00:00Z',
    createdBy: 'u4',
  },
  {
    id: 'p5',
    proposalNumber: 'PROP-2026-0045',
    title: 'Implementation Pack Only',
    customerId: 'c2',
    customerName: 'Greenfield Realty',
    assignedTo: 'u5',
    assignedToName: 'Sana (Sales Rep)',
    regionId: 'r2',
    teamId: 't1',
    status: 'rejected',
    validUntil: '2026-04-10',
    lineItems: [makeLineItem('li7', 'inv6', 'Implementation Services Pack', 'SVC-IMPL-001', 1, 75000, 18)],
    setupDeploymentCharges: 0,
    subtotal: 75000,
    totalDiscount: 0,
    totalTax: 13500,
    grandTotal: 88500,
    rejectionReason: 'Budget approved for next quarter. Please resubmit in April.',
    versionHistory: pVersions([makeLineItem('li7', 'inv6', 'Implementation Services Pack', 'SVC-IMPL-001', 1, 75000, 18)], 0, 75000, 0, 13500, 88500),
    currentVersion: 1,
    createdAt: '2026-03-10T11:00:00Z',
    updatedAt: '2026-03-11T16:00:00Z',
    createdBy: 'u5',
  },
  {
    id: 'p6',
    proposalNumber: 'PROP-2026-0046',
    title: 'Annual Renewal - Sunrise',
    customerId: 'c1',
    customerName: 'Sunrise Developers',
    assignedTo: 'u4',
    assignedToName: 'Amit (Sales Rep)',
    regionId: 'r2',
    teamId: 't1',
    status: 'deal_created',
    validUntil: '2026-04-25',
    lineItems: [
      makeLineItem('li8', 'inv1', 'Buildesk CRM Pro', 'CRM-PRO-001', 20, 14500, 18, 3),
      makeLineItem('li9', 'inv5', 'Support & AMC Monthly', 'SUB-AMC-MON', 12, 5000, 18),
    ],
    setupDeploymentCharges: 0,
    subtotal: 340000,
    totalDiscount: 10200,
    totalTax: 59364,
    grandTotal: 389164,
    finalQuoteValue: 385000,
    dealId: 'd1',
    versionHistory: pVersions(
      [makeLineItem('li8', 'inv1', 'Buildesk CRM Pro', 'CRM-PRO-001', 20, 14500, 18, 3), makeLineItem('li9', 'inv5', 'Support & AMC Monthly', 'SUB-AMC-MON', 12, 5000, 18)],
      0,
      340000, 10200, 59364, 389164
    ),
    currentVersion: 1,
    approvedBy: 'u3',
    approvedAt: '2026-03-09T12:00:00Z',
    sentAt: '2026-03-09T14:00:00Z',
    createdAt: '2026-03-08T08:00:00Z',
    updatedAt: '2026-03-09T15:00:00Z',
    createdBy: 'u4',
  },
];

export const seedDeals: Deal[] = [
  {
    id: 'd1',
    name: 'CRM+ERP Renewal 2026',
    customerId: 'c1',
    ownerUserId: 'u4',
    teamId: 't1',
    regionId: 'r2',
    stage: 'Negotiation',
    value: 385000,
    locked: true,
    proposalId: 'p6',
    dealStatus: 'Hot',
    dealSource: 'Referral',
    expectedCloseDate: '2026-06-30',
    priority: 'High',
    lastActivityAt: '2026-03-01T10:00:00Z',
    nextFollowUpDate: '2026-03-10',
    lossReason: null,
    contactPhone: '+91 90000 00001',
    remarks: 'Renewal — exec sponsor engaged',
    createdByUserId: 'u1',
    createdByName: 'Mohit (Admin)',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'd2',
    name: 'New Implementation',
    customerId: 'c2',
    ownerUserId: 'u5',
    teamId: 't1',
    regionId: 'r2',
    stage: 'Qualified',
    value: 220000,
    locked: false,
    proposalId: null,
    dealStatus: 'Cold',
    dealSource: 'Campaign',
    expectedCloseDate: '2026-09-15',
    priority: 'Medium',
    lastActivityAt: '2026-03-01T10:00:00Z',
    nextFollowUpDate: null,
    lossReason: null,
    contactPhone: null,
    remarks: null,
    createdByUserId: 'u3',
    createdByName: 'Ravi (Sales Manager)',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
];

export const seedNotifications: Notification[] = [
  { id: 'n1', type: 'CUSTOMER_EMAIL', to: 'accounts@sunrise.dev', subject: 'Buildesk Proposal PROP-2026-0007 shared', entityId: 'p1', at: '2026-03-10T15:00:00Z' },
  { id: 'n2', type: 'INTERNAL_EMAIL', to: 'admin@buildesk.com', subject: 'Final quote value overridden (Sales Manager)', entityId: 'p1', at: '2026-03-10T14:35:00Z' },
];

export const seedAutomationTemplates: AutomationTemplate[] = [
  // 1. Proposal sent — WhatsApp to customer
  {
    id: 'tpl-001',
    name: 'Proposal Sent — WhatsApp',
    trigger: 'proposal_sent',
    channel: 'whatsapp',
    recipients: ['customer'],
    isActive: true,
    delayHours: 0,
    body: `Hi {{customer_name}},\n\nThank you for your interest in Buildesk! 🎉\n\nWe have shared our proposal *{{proposal_number}}* for *{{proposal_title}}* with a total value of *{{grand_total}}*.\n\nThe proposal is valid until {{valid_until}}.\n\nFor any queries, contact {{sales_rep_name}} at {{sales_rep_phone}}.\n\nWarm regards,\nTeam Buildesk`,
    createdAt: '2026-03-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
  // 2. Proposal sent — Email to customer
  {
    id: 'tpl-002',
    name: 'Proposal Sent — Email',
    trigger: 'proposal_sent',
    channel: 'email',
    recipients: ['customer'],
    isActive: true,
    delayHours: 0,
    subject: 'Your Buildesk Proposal — {{proposal_number}}',
    body: `Dear {{customer_name}},\n\nPlease find enclosed our proposal {{proposal_number}} for {{proposal_title}}.\n\nProposal Value: {{grand_total}}\nValid Until: {{valid_until}}\n\nOur team is available to walk you through any questions.\n\nBest regards,\n{{sales_rep_name}}\nCravingcode Technologies Pvt. Ltd.`,
    createdAt: '2026-03-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
  // 3. Follow-up — WhatsApp after 3 days
  {
    id: 'tpl-003',
    name: 'Proposal Follow-up — WhatsApp (3 days)',
    trigger: 'proposal_follow_up',
    channel: 'whatsapp',
    recipients: ['customer'],
    isActive: true,
    delayHours: 72,
    repeatEveryHours: 48,
    maxRepeats: 2,
    body: `Hi {{customer_name}},\n\nJust following up on our proposal *{{proposal_number}}* sent {{days_since_sent}} days ago.\n\nWould you like to discuss or have any questions? 😊\n\nReach us at: {{sales_rep_phone}}\n\nTeam Buildesk`,
    createdAt: '2026-03-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
  // 4. Deal Won — WhatsApp to customer
  {
    id: 'tpl-004',
    name: 'Deal Won — Welcome WhatsApp',
    trigger: 'deal_won',
    channel: 'whatsapp',
    recipients: ['customer'],
    isActive: true,
    delayHours: 0,
    body: `Hi {{customer_name}},\n\nWelcome to the Buildesk family! 🎊\n\nWe're thrilled to confirm your deal *{{deal_title}}*.\n\nOur onboarding team will reach out within 24 hours.\n\nExcited to work with you!\nTeam Cravingcode`,
    createdAt: '2026-03-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
  // 5. Payment Due — WhatsApp to customer
  {
    id: 'tpl-005',
    name: 'Payment Due Reminder — WhatsApp',
    trigger: 'payment_due',
    channel: 'whatsapp',
    recipients: ['customer'],
    isActive: true,
    delayHours: 0,
    repeatEveryHours: 24,
    maxRepeats: 3,
    body: `Hi {{customer_name}},\n\nFriendly reminder: Invoice *{{invoice_number}}* of *{{amount_due}}* is due on *{{due_date}}* ({{days_until_due}} days remaining).\n\nPlease process the payment at your earliest convenience.\n\nFor queries: {{sales_rep_name}}`,
    createdAt: '2026-03-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
  // 6. Proposal Approved — in-app to Sales Rep
  {
    id: 'tpl-006',
    name: 'Proposal Approved — Sales Rep Alert',
    trigger: 'proposal_approved',
    channel: 'in_app',
    recipients: ['sales_rep'],
    isActive: true,
    delayHours: 0,
    body: `Proposal {{proposal_number}} for {{customer_name}} has been approved by {{approved_by}}. Grand total: {{grand_total}}.`,
    createdAt: '2026-03-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
  // 7. Proposal Approved — WhatsApp to customer (auto-send after approval)
  {
    id: 'tpl-007',
    name: 'Proposal Approved — WhatsApp to Customer',
    trigger: 'proposal_approved_customer_notify',
    channel: 'whatsapp',
    recipients: ['customer'],
    isActive: true,
    delayHours: 0,
    body: `Hi {{customer_name}},\n\nYour proposal *{{proposal_number}}* for *{{proposal_title}}* has been approved.\n\nTotal: *{{grand_total}}*\n\nIf you'd like any changes, reply here and {{sales_rep_name}} will help you.\n\nTeam Buildesk`,
    createdAt: '2026-03-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
  // 8. Proposal Approved — Email to customer (auto-send after approval)
  {
    id: 'tpl-008',
    name: 'Proposal Approved — Email to Customer',
    trigger: 'proposal_approved_customer_notify',
    channel: 'email',
    recipients: ['customer'],
    isActive: true,
    delayHours: 0,
    subject: 'Proposal approved — {{proposal_number}}',
    body: `Dear {{customer_name}},\n\nYour proposal {{proposal_number}} for {{proposal_title}} has been approved.\n\nProposal Value: {{grand_total}}\n\nIf you'd like any changes or have questions, please reply to this email or contact {{sales_rep_name}} ({{sales_rep_phone}}).\n\nBest regards,\nCravingcode Technologies Pvt. Ltd.`,
    createdAt: '2026-03-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
];

const seedNow = '2026-03-01T10:00:00Z';
function parseInrToNumber(raw: string) {
  const cleaned = raw
    .replace(/INR/gi, '')
    .replace(/₹/g, '')
    .replace(/,/g, '')
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function makeImportedInventoryItems(): InventoryItem[] {
  // Imported from the user's rate sheet (names + INR rates).
  // Kept as plain text to avoid copy/paste errors and allow easy updates.
  const namesRaw = `
Buildesk Sales Management Application (CRM)
Buildesk Post Sales Module
Software Consultancy
Website Development
AMC
Buildesk Sales Renewal
Buildesk Post Sales Renewal
Buildesk SMS Credit
GSuite
Integromat
One-time Wati Setup and Integration
Annual Pricing for Wati Annual License
Make.com Annual License
Support
Manpower Supplement
WhatsApp Business Credit Recharge
IVR Licenses
Auto Dialer Licenses
IVR Setup & Integration
Customisation
Truecaller
Integration / Implementation
Software Support Service
Reception Application Service
Reception Application Tab-Based Service
Annual License for Reception Admin Application
Annual License for Reception Tablet / Mobile Application
On Site Resource Deployment with Loading, Travel and Food
Customisation, Effort, Delivery Cost and Other Charges
Wati Annual Charges
Wati Verification, Configuration, and Setup
Buildesk Sales Licenses + Buildesk Post Sales Module Renewal
Marketing & Branding
Kredily Enterprise Plan
Job Portal
Lunch
Training
Buildesk Pay
White labelled iOS and Android Customer App - Development, configuration, setup and delivery
Customer Application License
CS Payment
Printing expenses
SendGrid
Truecaller (CR)
DeskTrack
TNT Mobitrack
Google workspace
Smart Android LED TV
Trademark
SMB
VMN Charges
Apple Developer Program (Automatic Renewal)
Advertisement Receipt -9th MAHACON
Email Services
Website Hosting Charges
Buildesk SIM Based Auto Dialer
Buildesk Sales licenses + Buildesk Post Sales Module
Other Charges
DLT Fees
Customer Application License Renewal
Setup Charges
On Premise Delivery Team Deployment for 15days
On Premise Delivery Team Deployment for 15 days
Pending Amount
Setup, Integration, On-site training and Resource
Customer App - White Labelled • Reception App • White Labelled • SMS and Email Integration• Setup and Training
Test Cement
Setup & Training
Introductory Discount
Buildesk Post sales + Buildesk Pay
Buildesk Reception Application
Test Product
BUILDESK CONTRACTOR MODULE
`;

  const ratesRaw = `
INR 25000.00
INR 125000.00
INR 50000.00
INR 5000.00
INR 5000.00
INR 50000.00
INR 200000.00
INR 0.195
INR 300.00
INR 8400.00
INR 1600.00
INR 28560.00
INR 9000.00
INR 50000.00
INR 40000.00
INR 800.00
INR 18000.00
INR 80000.00
INR 2000.00
INR 2000.00
INR 4500.00
INR 16000.00
INR 750000.00
INR 60000.00
INR 25000.00
INR 25000.00
INR 25000.00
INR 10000.00
INR 3000.00
INR 65000.00
INR 29000.00
INR 20000.00
INR 100000.00
INR 5000.00
INR 0.00
INR 0.00
INR 0.00
INR 28000.00
INR 100000.00
INR 200000.00
INR 9400.00
INR 3238.09
INR 12744.36
INR 165660.00
INR 18000.00
INR 8000.00
INR 2680.48
INR 17186.72
INR 5761.02
INR 25000.00
INR 600.00
INR 373.00
INR 30000.00
INR 18000.00
INR 10000.00
INR 300.00
INR 2000.00
INR 2000.00
INR 5900.00
INR 20000.00
INR 2000.00
INR 2000.00
INR 25000.00
INR 25000.00
INR 60000.00
INR 40000.00
INR 200000.00
INR 350.00
INR 100000.00
INR 55000.00
INR 100000.00
INR 20000.00
INR 12000.00
INR 0.00
INR 0.00
`;

  const names = namesRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const rates = ratesRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseInrToNumber);

  const count = Math.min(names.length, rates.length);
  const createdAt = seedNow;

  return Array.from({ length: count }).map((_, idx) => {
    const name = names[idx];
    const sellingPrice = rates[idx];
    const sku = `ITEM-${String(idx + 1).padStart(3, '0')}`;
    return {
      id: `inv_imp_${String(idx + 1).padStart(3, '0')}`,
      name,
      description: undefined,
      itemType: 'service',
      sku,
      hsnSacCode: undefined,
      category: 'Services',
      unitOfMeasure: 'unit',
      costPrice: 0,
      sellingPrice,
      taxRate: 18,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
      createdBy: 'u1',
      notes: undefined,
    };
  });
}

const importedInventoryItems = makeImportedInventoryItems();

export const seedInventoryItems: InventoryItem[] = [
  {
    id: 'inv1',
    name: 'Buildesk CRM Pro',
    description: 'Full CRM suite with contacts, deals, and reporting',
    itemType: 'product',
    sku: 'CRM-PRO-001',
    hsnSacCode: '998314',
    category: 'CRM Suite',
    unitOfMeasure: 'per license',
    costPrice: 8000,
    sellingPrice: 15000,
    taxRate: 18,
    isActive: true,
    createdAt: seedNow,
    updatedAt: seedNow,
    createdBy: 'u1',
    notes: 'Flagship product',
  },
  {
    id: 'inv2',
    name: 'ERP Integration Service',
    description: 'One-time implementation and integration with existing ERP',
    itemType: 'service',
    sku: 'SVC-ERP-001',
    hsnSacCode: '998313',
    category: 'ERP Platform',
    unitOfMeasure: 'per hour',
    costPrice: 1200,
    sellingPrice: 2500,
    taxRate: 18,
    isActive: true,
    createdAt: seedNow,
    updatedAt: seedNow,
    createdBy: 'u1',
  },
  {
    id: 'inv3',
    name: 'Analytics Add-on Annual',
    description: 'Advanced analytics and BI dashboards',
    itemType: 'subscription',
    sku: 'SUB-ANAL-ANN',
    hsnSacCode: '998314',
    category: 'Analytics Add-on',
    unitOfMeasure: 'per year',
    costPrice: 24000,
    sellingPrice: 42000,
    taxRate: 18,
    isActive: true,
    createdAt: seedNow,
    updatedAt: seedNow,
    createdBy: 'u1',
  },
  {
    id: 'inv4',
    name: 'Enterprise Bundle',
    description: 'CRM + ERP + Analytics, annual commitment',
    itemType: 'bundle',
    sku: 'BND-ENT-001',
    hsnSacCode: '998314',
    category: 'CRM Suite',
    unitOfMeasure: 'per year',
    costPrice: 180000,
    sellingPrice: 320000,
    taxRate: 18,
    isActive: true,
    createdAt: seedNow,
    updatedAt: seedNow,
    createdBy: 'u1',
  },
  {
    id: 'inv5',
    name: 'Support & AMC Monthly',
    description: 'Monthly support and annual maintenance contract',
    itemType: 'subscription',
    sku: 'SUB-AMC-MON',
    hsnSacCode: '998313',
    category: 'Support & AMC',
    unitOfMeasure: 'per month',
    costPrice: 3000,
    sellingPrice: 5500,
    taxRate: 18,
    isActive: true,
    createdAt: seedNow,
    updatedAt: seedNow,
    createdBy: 'u1',
  },
  {
    id: 'inv6',
    name: 'Implementation Services Pack',
    description: 'On-site implementation and training',
    itemType: 'service',
    sku: 'SVC-IMPL-001',
    hsnSacCode: '998313',
    category: 'Implementation Services',
    unitOfMeasure: 'per unit',
    costPrice: 45000,
    sellingPrice: 75000,
    taxRate: 18,
    isActive: true,
    createdAt: seedNow,
    updatedAt: seedNow,
    createdBy: 'u1',
  },
  {
    id: 'inv7',
    name: 'Storage Add-on (per GB)',
    description: 'Additional cloud storage per GB per month',
    itemType: 'subscription',
    sku: 'SUB-STOR-GB',
    hsnSacCode: '998314',
    category: 'Analytics Add-on',
    unitOfMeasure: 'per GB',
    costPrice: 2,
    sellingPrice: 5,
    taxRate: 18,
    isActive: true,
    createdAt: seedNow,
    updatedAt: seedNow,
    createdBy: 'u1',
  },
  {
    id: 'inv8',
    name: 'Legacy CRM Lite (Discontinued)',
    description: 'Legacy lite version - no new sales',
    itemType: 'product',
    sku: 'CRM-LITE-OLD',
    hsnSacCode: '998314',
    category: 'CRM Suite',
    unitOfMeasure: 'per license',
    costPrice: 2000,
    sellingPrice: 3500,
    taxRate: 18,
    isActive: false,
    createdAt: seedNow,
    updatedAt: seedNow,
    createdBy: 'u1',
    notes: 'Discontinued',
  },
  ...importedInventoryItems,
];
