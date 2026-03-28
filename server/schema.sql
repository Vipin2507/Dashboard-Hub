PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  leadId TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT,
  gstin TEXT,
  regionId TEXT NOT NULL,
  city TEXT,
  email TEXT,
  primaryPhone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  salesExecutive TEXT,
  accountManager TEXT,
  deliveryExecutive TEXT,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  regionId TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  teamId TEXT NOT NULL,
  regionId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  phone TEXT,
  joinDate TEXT,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  "to" TEXT NOT NULL,
  subject TEXT NOT NULL,
  entityId TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  itemType TEXT NOT NULL DEFAULT 'product',
  sku TEXT NOT NULL UNIQUE,
  hsnSacCode TEXT,
  category TEXT NOT NULL,
  unitOfMeasure TEXT NOT NULL,
  costPrice REAL NOT NULL DEFAULT 0,
  sellingPrice REAL NOT NULL DEFAULT 0,
  taxRate REAL NOT NULL DEFAULT 18,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  notes TEXT,
  stockQty REAL NOT NULL DEFAULT 0,
  supplier TEXT,
  location TEXT
);

CREATE TABLE IF NOT EXISTS masters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  proposalNumber TEXT NOT NULL,
  title TEXT NOT NULL,
  customerId TEXT NOT NULL,
  assignedTo TEXT NOT NULL,
  status TEXT NOT NULL,
  grandTotal REAL NOT NULL DEFAULT 0,
  finalQuoteValue REAL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deal_sequence (
  year INTEGER PRIMARY KEY,
  lastSeq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customerId TEXT NOT NULL,
  ownerUserId TEXT NOT NULL,
  teamId TEXT NOT NULL,
  regionId TEXT NOT NULL,
  stage TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  proposalId TEXT,
  dealStatus TEXT NOT NULL DEFAULT 'Active',
  dealSource TEXT,
  expectedCloseDate TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium',
  lastActivityAt TEXT,
  nextFollowUpDate TEXT,
  lossReason TEXT,
  contactPhone TEXT,
  remarks TEXT,
  createdByUserId TEXT,
  createdByName TEXT,
  createdAt TEXT,
  updatedAt TEXT,
  deletedAt TEXT,
  deletedByUserId TEXT,
  deletedByName TEXT
);

CREATE TABLE IF NOT EXISTS deal_audit (
  id TEXT PRIMARY KEY,
  dealId TEXT NOT NULL,
  action TEXT NOT NULL,
  detailJson TEXT,
  userId TEXT NOT NULL,
  userName TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deal_audit_dealId ON deal_audit (dealId);
CREATE INDEX IF NOT EXISTS idx_deal_audit_at ON deal_audit (at);

CREATE TABLE IF NOT EXISTS automation_templates (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  channel TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  updatedAt TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_logs (
  id TEXT PRIMARY KEY,
  sentAt TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_customerId ON proposals(customerId);
CREATE INDEX IF NOT EXISTS idx_proposals_createdAt ON proposals(createdAt);
CREATE INDEX IF NOT EXISTS idx_deals_customerId ON deals(customerId);
CREATE INDEX IF NOT EXISTS idx_deals_ownerUserId ON deals(ownerUserId);
-- idx_deals_dealStatus: created in db.js after migrateDealSchema() so older DBs get dealStatus column first
CREATE INDEX IF NOT EXISTS idx_automation_templates_trigger ON automation_templates(trigger);
CREATE INDEX IF NOT EXISTS idx_automation_logs_sentAt ON automation_logs(sentAt);
CREATE INDEX IF NOT EXISTS idx_users_teamId ON users(teamId);
CREATE INDEX IF NOT EXISTS idx_users_regionId ON users(regionId);
CREATE INDEX IF NOT EXISTS idx_teams_regionId ON teams(regionId);
CREATE INDEX IF NOT EXISTS idx_notifications_at ON notifications(at);

CREATE INDEX IF NOT EXISTS idx_masters_type ON masters(type);

CREATE TABLE IF NOT EXISTS payment_plan_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  defaultBillingCycle TEXT NOT NULL DEFAULT 'yearly',
  defaultGraceDays INTEGER NOT NULL DEFAULT 5,
  suggestedInstallments INTEGER,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipt_sequence (
  year INTEGER PRIMARY KEY,
  lastSeq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customer_proposal_decision (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  proposalId TEXT NOT NULL,
  status TEXT NOT NULL,
  rejectionReason TEXT,
  decisionDate TEXT NOT NULL,
  approvedByUserId TEXT,
  approvedByName TEXT,
  remarks TEXT,
  updatedAt TEXT NOT NULL,
  UNIQUE(customerId, proposalId)
);

CREATE INDEX IF NOT EXISTS idx_proposal_decision_customer ON customer_proposal_decision (customerId);

CREATE TABLE IF NOT EXISTS customer_payment_plan (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL UNIQUE,
  catalogPlanId TEXT NOT NULL,
  planName TEXT NOT NULL,
  billingCycle TEXT NOT NULL,
  totalPlanAmount REAL NOT NULL,
  planStartDate TEXT NOT NULL,
  planEndDate TEXT NOT NULL,
  numInstallments INTEGER NOT NULL,
  perInstallmentAmount REAL NOT NULL,
  nextDueDate TEXT NOT NULL,
  gracePeriodDays INTEGER NOT NULL DEFAULT 5,
  creditBalance REAL NOT NULL DEFAULT 0,
  amountPaidTotal REAL NOT NULL DEFAULT 0,
  partialAllowed INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cpp_customer ON customer_payment_plan (customerId);

CREATE TABLE IF NOT EXISTS customer_payment_record (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  planId TEXT NOT NULL,
  receiptNumber TEXT UNIQUE,
  paymentMode TEXT NOT NULL,
  transactionRef TEXT,
  bankName TEXT,
  chequeNumber TEXT,
  receiptFileRef TEXT,
  paymentDate TEXT NOT NULL,
  amountPaid REAL NOT NULL,
  paymentStatus TEXT NOT NULL,
  adminConfirmed INTEGER NOT NULL DEFAULT 0,
  adminConfirmedBy TEXT,
  adminConfirmedByName TEXT,
  adminConfirmedAt TEXT,
  internalNotes TEXT,
  isPartial INTEGER NOT NULL DEFAULT 0,
  balanceCarriedForward REAL NOT NULL DEFAULT 0,
  receiptSent INTEGER NOT NULL DEFAULT 0,
  billingCycleSnapshot TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cpr_customer ON customer_payment_record (customerId);
CREATE INDEX IF NOT EXISTS idx_cpr_plan ON customer_payment_record (planId);
CREATE INDEX IF NOT EXISTS idx_cpr_date ON customer_payment_record (paymentDate);

CREATE TABLE IF NOT EXISTS payment_audit (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  customerId TEXT,
  action TEXT NOT NULL,
  detailJson TEXT,
  userId TEXT NOT NULL,
  userName TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_customer ON payment_audit (customerId);
CREATE INDEX IF NOT EXISTS idx_payment_audit_at ON payment_audit (at);

CREATE TABLE IF NOT EXISTS data_control_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  fieldKey TEXT,
  oldValue TEXT,
  newValue TEXT,
  detailJson TEXT,
  userId TEXT NOT NULL,
  userName TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dca_module_at ON data_control_audit (module, at);
CREATE INDEX IF NOT EXISTS idx_dca_entity ON data_control_audit (entityType, entityId, fieldKey, at);

-- Renewal & subscription tracker (synced from payment plans + manual rows)
CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  planName TEXT NOT NULL,
  expiryDate TEXT NOT NULL,
  renewalAmount REAL,
  billingCycle TEXT,
  source TEXT NOT NULL DEFAULT 'payment_plan',
  sourceRef TEXT,
  lastRenewedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (customerId) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_cust_sub_customer ON customer_subscriptions (customerId);
CREATE INDEX IF NOT EXISTS idx_cust_sub_expiry ON customer_subscriptions (expiryDate);

CREATE TABLE IF NOT EXISTS subscription_reminder_state (
  subscriptionId TEXT PRIMARY KEY,
  reminder30Count INTEGER NOT NULL DEFAULT 0,
  reminderExpiryDayCount INTEGER NOT NULL DEFAULT 0,
  overdueReminderCount INTEGER NOT NULL DEFAULT 0,
  lastOverdueReminderAt TEXT,
  pendingAutomations INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (subscriptionId) REFERENCES customer_subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS renewal_reminder_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
