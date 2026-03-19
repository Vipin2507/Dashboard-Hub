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
  deliveryExecutive TEXT
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
  status TEXT NOT NULL DEFAULT 'active'
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
  notes TEXT
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
  proposalId TEXT
);

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
CREATE INDEX IF NOT EXISTS idx_automation_templates_trigger ON automation_templates(trigger);
CREATE INDEX IF NOT EXISTS idx_automation_logs_sentAt ON automation_logs(sentAt);
CREATE INDEX IF NOT EXISTS idx_users_teamId ON users(teamId);
CREATE INDEX IF NOT EXISTS idx_users_regionId ON users(regionId);
CREATE INDEX IF NOT EXISTS idx_teams_regionId ON teams(regionId);
CREATE INDEX IF NOT EXISTS idx_notifications_at ON notifications(at);

CREATE INDEX IF NOT EXISTS idx_masters_type ON masters(type);
