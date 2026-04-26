import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SQLITE_PATH = process.env.SQLITE_PATH || path.resolve(__dirname, "..", "data", "app.db");
const schemaPath = path.resolve(__dirname, "schema.sql");

fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });

const db = new Database(SQLITE_PATH);
// eslint-disable-next-line no-console
console.log(`[buildesk] sqlite: ${SQLITE_PATH}`);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(schemaPath, "utf8"));

/** Add deal columns on existing DBs (CREATE TABLE already has them for new installs). */
function migrateDealSchema() {
  const cols = db.prepare("PRAGMA table_info(deals)").all();
  const names = new Set(cols.map((c) => c.name));
  const add = (sql) => db.exec(sql);
  if (!names.has("dealStatus")) add("ALTER TABLE deals ADD COLUMN dealStatus TEXT DEFAULT 'Active'");
  if (!names.has("deliveryStatus")) add("ALTER TABLE deals ADD COLUMN deliveryStatus TEXT");
  if (!names.has("deliveryUpdatedAt")) add("ALTER TABLE deals ADD COLUMN deliveryUpdatedAt TEXT");
  if (!names.has("deliveryFinalApprovedBy")) add("ALTER TABLE deals ADD COLUMN deliveryFinalApprovedBy TEXT");
  if (!names.has("deliveryFinalApprovedAt")) add("ALTER TABLE deals ADD COLUMN deliveryFinalApprovedAt TEXT");
  if (!names.has("deliveryAssigneeUserId")) add("ALTER TABLE deals ADD COLUMN deliveryAssigneeUserId TEXT");
  if (!names.has("deliveryAssigneeName")) add("ALTER TABLE deals ADD COLUMN deliveryAssigneeName TEXT");
  if (!names.has("invoiceStatus")) add("ALTER TABLE deals ADD COLUMN invoiceStatus TEXT");
  if (!names.has("invoiceDate")) add("ALTER TABLE deals ADD COLUMN invoiceDate TEXT");
  if (!names.has("invoiceNumber")) add("ALTER TABLE deals ADD COLUMN invoiceNumber TEXT");
  if (!names.has("totalAmount")) add("ALTER TABLE deals ADD COLUMN totalAmount REAL NOT NULL DEFAULT 0");
  if (!names.has("taxAmount")) add("ALTER TABLE deals ADD COLUMN taxAmount REAL NOT NULL DEFAULT 0");
  if (!names.has("amountWithoutTax")) add("ALTER TABLE deals ADD COLUMN amountWithoutTax REAL NOT NULL DEFAULT 0");
  if (!names.has("placeOfSupply")) add("ALTER TABLE deals ADD COLUMN placeOfSupply TEXT");
  if (!names.has("balanceAmount")) add("ALTER TABLE deals ADD COLUMN balanceAmount REAL NOT NULL DEFAULT 0");
  if (!names.has("amountPaid")) add("ALTER TABLE deals ADD COLUMN amountPaid REAL NOT NULL DEFAULT 0");
  if (!names.has("serviceName")) add("ALTER TABLE deals ADD COLUMN serviceName TEXT");
  if (!names.has("dealSource")) add("ALTER TABLE deals ADD COLUMN dealSource TEXT");
  if (!names.has("expectedCloseDate")) add("ALTER TABLE deals ADD COLUMN expectedCloseDate TEXT");
  if (!names.has("priority")) add("ALTER TABLE deals ADD COLUMN priority TEXT DEFAULT 'Medium'");
  if (!names.has("lastActivityAt")) add("ALTER TABLE deals ADD COLUMN lastActivityAt TEXT");
  if (!names.has("nextFollowUpDate")) add("ALTER TABLE deals ADD COLUMN nextFollowUpDate TEXT");
  if (!names.has("lossReason")) add("ALTER TABLE deals ADD COLUMN lossReason TEXT");
  if (!names.has("contactPhone")) add("ALTER TABLE deals ADD COLUMN contactPhone TEXT");
  if (!names.has("remarks")) add("ALTER TABLE deals ADD COLUMN remarks TEXT");
  if (!names.has("createdByUserId")) add("ALTER TABLE deals ADD COLUMN createdByUserId TEXT");
  if (!names.has("createdByName")) add("ALTER TABLE deals ADD COLUMN createdByName TEXT");
  if (!names.has("createdAt")) add("ALTER TABLE deals ADD COLUMN createdAt TEXT");
  if (!names.has("updatedAt")) add("ALTER TABLE deals ADD COLUMN updatedAt TEXT");
  if (!names.has("deletedAt")) add("ALTER TABLE deals ADD COLUMN deletedAt TEXT");
  if (!names.has("deletedByUserId")) add("ALTER TABLE deals ADD COLUMN deletedByUserId TEXT");
  if (!names.has("deletedByName")) add("ALTER TABLE deals ADD COLUMN deletedByName TEXT");
  db.prepare("UPDATE deals SET dealStatus = 'Active' WHERE dealStatus IS NULL OR dealStatus = ''").run();
  db.prepare("UPDATE deals SET priority = 'Medium' WHERE priority IS NULL OR priority = ''").run();
  db.prepare("UPDATE deals SET totalAmount = COALESCE(totalAmount, value, 0) WHERE totalAmount IS NULL").run();
  db.prepare("UPDATE deals SET amountPaid = COALESCE(amountPaid, 0) WHERE amountPaid IS NULL").run();
  db.prepare("UPDATE deals SET balanceAmount = COALESCE(balanceAmount, totalAmount - amountPaid, 0) WHERE balanceAmount IS NULL").run();
  db.prepare("UPDATE deals SET taxAmount = COALESCE(taxAmount, 0) WHERE taxAmount IS NULL").run();
  db.prepare("UPDATE deals SET amountWithoutTax = COALESCE(amountWithoutTax, 0) WHERE amountWithoutTax IS NULL").run();
  db.prepare(
    "UPDATE deals SET createdAt = COALESCE(createdAt, lastActivityAt, datetime('now')) WHERE createdAt IS NULL OR createdAt = ''",
  ).run();
  // Safe after ALTERs: older DBs may not have had dealStatus until migrateDealSchema ran.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deals_dealStatus ON deals(dealStatus)`);
}
migrateDealSchema();

function migrateDeliveryAndHistorySchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      dealId TEXT NOT NULL,
      customerId TEXT NOT NULL,
      fromStatus TEXT,
      toStatus TEXT NOT NULL,
      notes TEXT,
      performedBy TEXT,
      performedByName TEXT,
      at TEXT NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_delivery_logs_dealId ON delivery_logs (dealId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_delivery_logs_customerId ON delivery_logs (customerId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_delivery_logs_at ON delivery_logs (at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS central_history_db (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      channel TEXT NOT NULL,
      direction TEXT NOT NULL,
      summary TEXT,
      payloadJson TEXT,
      performedBy TEXT,
      performedByName TEXT,
      at TEXT NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_central_history_customer_at ON central_history_db (customerId, at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_central_history_entity ON central_history_db (entityType, entityId, at)`);
}
migrateDeliveryAndHistorySchema();

/** Install payments v2 tables (MoM 19/04/2026) without losing legacy tables. */
function migratePaymentsSchema() {
  // If the legacy tables already exist with the old names, rename them so we can create the new v2 tables
  // with the names required by the MoM spec.
  const hasTable = (name) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);

  const renameIfNeeded = (from, to) => {
    if (!hasTable(from) || hasTable(to)) return;
    db.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
  };

  renameIfNeeded("payment_plan_catalog", "payment_plan_catalog_legacy");
  renameIfNeeded("payment_audit", "payment_audit_legacy");

  // Create v2 tables if missing (schema.sql has them for fresh installs, but old DBs need this after rename).
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_plan_catalog (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      installments INTEGER NOT NULL DEFAULT 1,
      schedule TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_payment_plans (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      proposal_id TEXT REFERENCES proposals(id),
      plan_catalog_id TEXT REFERENCES payment_plan_catalog(id),
      plan_name TEXT NOT NULL,
      total_amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      remaining_amount REAL NOT NULL,
      status TEXT DEFAULT 'active',
      start_date TEXT NOT NULL,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_installments (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES customer_payment_plans(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      deal_id TEXT NOT NULL REFERENCES deals(id),
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      percentage REAL,
      due_date TEXT NOT NULL,
      paid_date TEXT,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      payment_mode TEXT,
      transaction_reference TEXT,
      receipt_number TEXT,
      receipt_sent INTEGER DEFAULT 0,
      notes TEXT,
      confirmed_by TEXT REFERENCES users(id),
      confirmed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_audit (
      id TEXT PRIMARY KEY,
      installment_id TEXT REFERENCES payment_installments(id),
      plan_id TEXT REFERENCES customer_payment_plans(id),
      customer_id TEXT REFERENCES customers(id),
      action TEXT NOT NULL,
      performed_by TEXT REFERENCES users(id),
      performed_by_name TEXT,
      old_value TEXT,
      new_value TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_installments_customer ON payment_installments(customer_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_installments_status ON payment_installments(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_installments_due_date ON payment_installments(due_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_plans_deal ON customer_payment_plans(deal_id)`);
}
migratePaymentsSchema();

function migrateDataControlColumns() {
  const addCol = (table, col, sqlType) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some((c) => c.name === col)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${sqlType}`);
  };
  addCol("customers", "remarks", "TEXT");
  addCol("users", "phone", "TEXT");
  addCol("users", "joinDate", "TEXT");
  addCol("users", "remarks", "TEXT");
  addCol("inventory", "stockQty", "REAL NOT NULL DEFAULT 0");
  addCol("inventory", "supplier", "TEXT");
  addCol("inventory", "location", "TEXT");
}
migrateDataControlColumns();

db.exec(`
  CREATE TABLE IF NOT EXISTS deal_sequence (
    year INTEGER PRIMARY KEY,
    lastSeq INTEGER NOT NULL DEFAULT 0
  );
`);

const seedNow = "2026-03-01T10:00:00Z";

const seedCustomers = [
  {
    id: "c1",
    leadId: "L-0001",
    name: "Sunrise Developers",
    state: "Maharashtra",
    gstin: "27ABCDE1234F1Z5",
    regionId: "r2",
    city: "Mumbai",
    email: "contact@sunrise.dev",
    primaryPhone: "+91 90000 00001",
    status: "active",
    createdAt: "2026-03-01T10:00:00Z",
    salesExecutive: "Vaibhav Agrawal (Sales Executive)",
    accountManager: "Mohit Singht (admin)",
    deliveryExecutive: "Anurag",
  },
  {
    id: "c2",
    leadId: "L-0002",
    name: "Greenfield Realty",
    state: "Gujarat",
    gstin: null,
    regionId: "r2",
    city: "Ahmedabad",
    email: "info@greenfieldrealty.in",
    primaryPhone: "+91 90000 00002",
    status: "active",
    createdAt: "2026-03-05T11:30:00Z",
    salesExecutive: "Shubham Behera (Sale Executive)",
    accountManager: "Mohit Singht (admin)",
    deliveryExecutive: "Anurag",
  },
  {
    id: "c3",
    leadId: "L-0003",
    name: "NorthStar Builders",
    state: "Delhi",
    gstin: "07ABCDE1234F1Z5",
    regionId: "r1",
    city: "New Delhi",
    email: "sales@northstar.dev",
    primaryPhone: "+91 90000 00003",
    status: "inactive",
    createdAt: "2026-02-20T09:15:00Z",
    salesExecutive: "Sharad VS (Sale Executive)",
    accountManager: "Mohit Singht (admin)",
    deliveryExecutive: "Kiran",
  },
];

function parseInrToNumber(raw) {
  const cleaned = String(raw || "")
    .replace(/INR/gi, "")
    .replace(/₹/g, "")
    .replace(/,/g, "")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function makeImportedInventory(seedNow) {
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
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const rates = ratesRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseInrToNumber);

  const count = Math.min(names.length, rates.length);
  return Array.from({ length: count }).map((_, idx) => {
    const name = names[idx];
    const sellingPrice = rates[idx];
    const sku = `ITEM-${String(idx + 1).padStart(3, "0")}`;
    return {
      id: `inv_imp_${String(idx + 1).padStart(3, "0")}`,
      name,
      description: null,
      itemType: "service",
      sku,
      hsnSacCode: null,
      category: "Services",
      unitOfMeasure: "unit",
      costPrice: 0,
      sellingPrice,
      taxRate: 18,
      isActive: 1,
      createdAt: seedNow,
      updatedAt: seedNow,
      createdBy: "u1",
      notes: null,
    };
  });
}

const seedInventory = makeImportedInventory(seedNow);

const seedMasters = [
  { id: "mc1", name: "CRM Suite", type: "product_category" },
  { id: "mc2", name: "ERP Platform", type: "product_category" },
  { id: "mc3", name: "Analytics Add-on", type: "product_category" },
  { id: "ms1", name: "Monthly", type: "subscription_type" },
  { id: "ms2", name: "Annual", type: "subscription_type" },
  { id: "mf1", name: "Standard", type: "proposal_format" },
  { id: "mf2", name: "Enterprise", type: "proposal_format" },
];

const seedDeals = [
  {
    id: "d1",
    name: "CRM+ERP Renewal 2026",
    customerId: "c1",
    ownerUserId: "u4",
    teamId: "t1",
    regionId: "r2",
    stage: "Negotiation",
    value: 385000,
    locked: 1,
    proposalId: "p6",
    dealStatus: "Hot",
    dealSource: "Referral",
    expectedCloseDate: "2026-06-30",
    priority: "High",
    lastActivityAt: seedNow,
    nextFollowUpDate: "2026-03-10",
    lossReason: null,
    contactPhone: "+91 90000 00001",
    remarks: "Renewal — exec sponsor engaged",
    createdByUserId: "u1",
    createdByName: "Mohit Singht (admin)",
    createdAt: seedNow,
    updatedAt: seedNow,
    deletedAt: null,
    deletedByUserId: null,
    deletedByName: null,
  },
  {
    id: "d2",
    name: "New Implementation",
    customerId: "c2",
    ownerUserId: "u5",
    teamId: "t2",
    regionId: "r2",
    stage: "Qualified",
    value: 220000,
    locked: 0,
    proposalId: null,
    dealStatus: "Cold",
    dealSource: "Campaign",
    expectedCloseDate: "2026-09-15",
    priority: "Medium",
    lastActivityAt: seedNow,
    nextFollowUpDate: null,
    lossReason: null,
    contactPhone: null,
    remarks: null,
    createdByUserId: "u2",
    createdByName: "Vaibhav Agrawal (Sales Executive)",
    createdAt: seedNow,
    updatedAt: seedNow,
    deletedAt: null,
    deletedByUserId: null,
    deletedByName: null,
  },
];

const seedRegions = [
  { id: "r1", name: "North" },
  { id: "r2", name: "West" },
  { id: "r3", name: "South" },
];

const seedTeams = [
  { id: "t1", name: "Sales Team", regionId: "r2" },
];

const seedUsers = [
  { id: "u1", name: "Mohit Singht (admin)", email: "mohit@cravingcode.in", password: "buildesk", role: "super_admin", teamId: "t1", regionId: "r2", status: "active" },
  { id: "u2", name: "Vaibhav Agrawal (Sales Executive)", email: "vaibhav@cravingcode.in", password: "buildesk", role: "sales_rep", teamId: "t1", regionId: "r2", status: "active" },
  { id: "u3", name: "Shubham Behera (Sale Executive)", email: "shubham@cravingcode.in", password: "buildesk", role: "sales_rep", teamId: "t1", regionId: "r2", status: "active" },
  { id: "u4", name: "Sharad VS (Sale Executive)", email: "sharad@cravingcode.in", password: "buildesk", role: "sales_rep", teamId: "t1", regionId: "r2", status: "active" },
  { id: "u5", name: "Wasim Mondel (Sale Executive)", email: "wasim@cravingcode.in", password: "buildesk", role: "sales_rep", teamId: "t1", regionId: "r2", status: "active" },
  { id: "u6", name: "Dylan David (Sale Executive)", email: "dylan@cravingcode.in", password: "buildesk", role: "sales_rep", teamId: "t1", regionId: "r2", status: "active" },
  { id: "u7", name: "Bhumit Fluria (Sale Executive)", email: "bhumit@cravingcode.in", password: "buildesk", role: "sales_rep", teamId: "t1", regionId: "r2", status: "active" },
  { id: "u8", name: "Preeti Rai (Pre-sales agent)", email: "preeti@cravingcode.in", password: "buildesk", role: "sales_rep", teamId: "t1", regionId: "r2", status: "active" },
];

db.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updatedAt TEXT NOT NULL
  );
`);

function getMeta(key) {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key);
  return row?.value ?? null;
}

function setMeta(key, value) {
  db.prepare(
    `INSERT INTO app_meta (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt`,
  ).run(key, value, new Date().toISOString());
}

const USERS_TEAMS_SEED_KEY = "seed_users_teams_v5";
const INVENTORY_SEED_KEY = "seed_inventory_v1";

function reseedUsersAndTeamsIfNeeded() {
  // Bump this key when seedUsers/seedTeams change so deploys refresh SQLite on existing installs.
  // VPS: deploy + restart API. If still stale, set FORCE_RESEED_USERS=1 once, restart, then unset.
  const SEED_KEY = USERS_TEAMS_SEED_KEY;
  if (process.env.FORCE_RESEED_USERS === "1" || process.env.FORCE_RESEED_USERS === "true") {
    db.prepare("DELETE FROM app_meta WHERE key = ?").run(SEED_KEY);
  }
  if (getMeta(SEED_KEY) === "1") return;

  console.log(`[buildesk] ${SEED_KEY}: reseeding users and teams from server/db.js seed.`);

  db.transaction(() => {
    db.prepare("DELETE FROM users").run();
    db.prepare("DELETE FROM teams").run();

    const insertTeam = db.prepare("INSERT INTO teams (id, name, regionId) VALUES (@id, @name, @regionId)");
    seedTeams.forEach((t) => insertTeam.run(t));

    const insertUser = db.prepare(
      "INSERT INTO users (id, name, email, password, role, teamId, regionId, status) VALUES (@id, @name, @email, @password, @role, @teamId, @regionId, @status)",
    );
    seedUsers.forEach((u) => insertUser.run(u));
  })();

  setMeta(SEED_KEY, "1");
}

function forceReseedUsersAndTeams() {
  db.prepare("DELETE FROM app_meta WHERE key = ?").run(USERS_TEAMS_SEED_KEY);
  reseedUsersAndTeamsIfNeeded();
}

function reseedInventoryIfRequested() {
  // Dev/ops helper: allows refreshing seeded inventory on existing DBs.
  // WARNING: This deletes ALL inventory rows before re-seeding.
  const force =
    process.env.FORCE_RESEED_INVENTORY === "1" || process.env.FORCE_RESEED_INVENTORY === "true";
  if (!force) return;

  console.log(`[buildesk] ${INVENTORY_SEED_KEY}: FORCE_RESEED_INVENTORY is set — reseeding inventory.`);
  db.transaction(() => {
    db.prepare("DELETE FROM inventory").run();

    const insertInventory = db.prepare(`
      INSERT INTO inventory (
        id, name, description, itemType, sku, hsnSacCode, category, unitOfMeasure, costPrice, sellingPrice, taxRate, isActive, createdAt, updatedAt, createdBy, notes
      ) VALUES (
        @id, @name, @description, @itemType, @sku, @hsnSacCode, @category, @unitOfMeasure, @costPrice, @sellingPrice, @taxRate, @isActive, @createdAt, @updatedAt, @createdBy, @notes
      )
    `);
    seedInventory.forEach((r) => insertInventory.run(r));
  })();

  setMeta(INVENTORY_SEED_KEY, "1");
}

const seedNotifications = [
  { id: "n1", type: "CUSTOMER_EMAIL", to: "accounts@sunrise.dev", subject: "Buildesk Proposal PROP-2026-0007 shared", entityId: "p1", at: "2026-03-10T15:00:00Z" },
  { id: "n2", type: "INTERNAL_EMAIL", to: "admin@buildesk.com", subject: "Final quote value overridden (Sales Manager)", entityId: "p1", at: "2026-03-10T14:35:00Z" },
];

const seedPaymentPlanCatalog = [
  { id: "ppc1", name: "Enterprise Annual", defaultBillingCycle: "yearly", defaultGraceDays: 7, suggestedInstallments: 1, createdAt: seedNow },
  { id: "ppc2", name: "Standard Quarterly", defaultBillingCycle: "quarterly", defaultGraceDays: 5, suggestedInstallments: 4, createdAt: seedNow },
  { id: "ppc3", name: "SMB Monthly", defaultBillingCycle: "monthly", defaultGraceDays: 3, suggestedInstallments: 12, createdAt: seedNow },
];

function seedIfEmpty() {
  const customerCount = db.prepare("SELECT COUNT(*) AS c FROM customers").get().c;
  if (customerCount === 0) {
    const insertCustomer = db.prepare(`
      INSERT INTO customers (
        id, leadId, name, state, gstin, regionId, city, email, primaryPhone, status, createdAt, salesExecutive, accountManager, deliveryExecutive
      ) VALUES (
        @id, @leadId, @name, @state, @gstin, @regionId, @city, @email, @primaryPhone, @status, @createdAt, @salesExecutive, @accountManager, @deliveryExecutive
      )
    `);
    const tx = db.transaction((rows) => rows.forEach((r) => insertCustomer.run(r)));
    tx(seedCustomers);
  }

  const inventoryCount = db.prepare("SELECT COUNT(*) AS c FROM inventory").get().c;
  if (inventoryCount === 0) {
    const insertInventory = db.prepare(`
      INSERT INTO inventory (
        id, name, description, itemType, sku, hsnSacCode, category, unitOfMeasure, costPrice, sellingPrice, taxRate, isActive, createdAt, updatedAt, createdBy, notes
      ) VALUES (
        @id, @name, @description, @itemType, @sku, @hsnSacCode, @category, @unitOfMeasure, @costPrice, @sellingPrice, @taxRate, @isActive, @createdAt, @updatedAt, @createdBy, @notes
      )
    `);
    const tx = db.transaction((rows) => rows.forEach((r) => insertInventory.run(r)));
    tx(seedInventory);
  }

  const mastersCount = db.prepare("SELECT COUNT(*) AS c FROM masters").get().c;
  if (mastersCount === 0) {
    const insertMaster = db.prepare("INSERT INTO masters (id, name, type) VALUES (@id, @name, @type)");
    const tx = db.transaction((rows) => rows.forEach((r) => insertMaster.run(r)));
    tx(seedMasters);
  }

  const dealsCount = db.prepare("SELECT COUNT(*) AS c FROM deals").get().c;
  if (dealsCount === 0) {
    const insertDeal = db.prepare(`
      INSERT INTO deals (
        id, name, customerId, ownerUserId, teamId, regionId, stage, value, locked, proposalId,
        dealStatus, dealSource, expectedCloseDate, priority, lastActivityAt, nextFollowUpDate, lossReason,
        contactPhone, remarks, createdByUserId, createdByName, createdAt, updatedAt, deletedAt, deletedByUserId, deletedByName
      ) VALUES (
        @id, @name, @customerId, @ownerUserId, @teamId, @regionId, @stage, @value, @locked, @proposalId,
        @dealStatus, @dealSource, @expectedCloseDate, @priority, @lastActivityAt, @nextFollowUpDate, @lossReason,
        @contactPhone, @remarks, @createdByUserId, @createdByName, @createdAt, @updatedAt, @deletedAt, @deletedByUserId, @deletedByName
      )
    `);
    const tx = db.transaction((rows) => rows.forEach((r) => insertDeal.run(r)));
    tx(seedDeals);
  }

  const automationSettingsCount = db
    .prepare("SELECT COUNT(*) AS c FROM automation_settings")
    .get().c;
  if (automationSettingsCount === 0) {
    const defaultSettings = {
      n8nWebhookBase: "http://72.60.200.185:5678/webhook",
      wahaApiUrl: "http://72.60.200.185:3000",
      wahaApiKey: "MySecretWAHAKey",
      wahaSession: "first",
      wahaFromNumber: "",
      emailFromAddress: "noreply@buildesk.in",
      emailFromName: "Buildesk CRM",
      isWahaConnected: false,
      isN8nConnected: false,
    };
    db.prepare(
      "INSERT INTO automation_settings (id, data, updatedAt) VALUES (1, ?, ?)"
    ).run(JSON.stringify(defaultSettings), new Date().toISOString());
  }

  const regionsCount = db.prepare("SELECT COUNT(*) AS c FROM regions").get().c;
  if (regionsCount === 0) {
    const stmt = db.prepare("INSERT INTO regions (id, name) VALUES (@id, @name)");
    db.transaction((rows) => rows.forEach((r) => stmt.run(r)))(seedRegions);
  }

  const teamsCount = db.prepare("SELECT COUNT(*) AS c FROM teams").get().c;
  if (teamsCount === 0) {
    const stmt = db.prepare("INSERT INTO teams (id, name, regionId) VALUES (@id, @name, @regionId)");
    db.transaction((rows) => rows.forEach((r) => stmt.run(r)))(seedTeams);
  }

  const usersCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (usersCount === 0) {
    const stmt = db.prepare(
      "INSERT INTO users (id, name, email, password, role, teamId, regionId, status) VALUES (@id, @name, @email, @password, @role, @teamId, @regionId, @status)"
    );
    db.transaction((rows) => rows.forEach((r) => stmt.run(r)))(seedUsers);
  }

  const notificationsCount = db.prepare("SELECT COUNT(*) AS c FROM notifications").get().c;
  if (notificationsCount === 0) {
    const stmt = db.prepare(
      "INSERT INTO notifications (id, type, \"to\", subject, entityId, at) VALUES (@id, @type, @to, @subject, @entityId, @at)"
    );
    db.transaction((rows) => rows.forEach((r) => stmt.run(r)))(seedNotifications);
  }

  const ppcCount = db.prepare("SELECT COUNT(*) AS c FROM payment_plan_catalog_legacy").get().c;
  if (ppcCount === 0) {
    const stmt = db.prepare(
      `INSERT INTO payment_plan_catalog_legacy (id, name, defaultBillingCycle, defaultGraceDays, suggestedInstallments, createdAt)
       VALUES (@id, @name, @defaultBillingCycle, @defaultGraceDays, @suggestedInstallments, @createdAt)`
    );
    db.transaction((rows) => rows.forEach((r) => stmt.run(r)))(seedPaymentPlanCatalog);
  }
}

seedIfEmpty();
reseedInventoryIfRequested();
reseedUsersAndTeamsIfNeeded();

export { db, SQLITE_PATH, USERS_TEAMS_SEED_KEY, INVENTORY_SEED_KEY, reseedUsersAndTeamsIfNeeded, forceReseedUsersAndTeams };
