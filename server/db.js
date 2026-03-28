import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const SQLITE_PATH = process.env.SQLITE_PATH || path.resolve(process.cwd(), "data", "app.db");
const schemaPath = path.resolve(process.cwd(), "server", "schema.sql");

fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });

const db = new Database(SQLITE_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(schemaPath, "utf8"));

/** Add deal columns on existing DBs (CREATE TABLE already has them for new installs). */
function migrateDealSchema() {
  const cols = db.prepare("PRAGMA table_info(deals)").all();
  const names = new Set(cols.map((c) => c.name));
  const add = (sql) => db.exec(sql);
  if (!names.has("dealStatus")) add("ALTER TABLE deals ADD COLUMN dealStatus TEXT DEFAULT 'Active'");
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
  db.prepare(
    "UPDATE deals SET createdAt = COALESCE(createdAt, lastActivityAt, datetime('now')) WHERE createdAt IS NULL OR createdAt = ''",
  ).run();
  // Safe after ALTERs: older DBs may not have had dealStatus until migrateDealSchema ran.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deals_dealStatus ON deals(dealStatus)`);
}
migrateDealSchema();

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
    salesExecutive: "Amit (Sales Rep)",
    accountManager: "Ravi (Sales Manager)",
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
    salesExecutive: "Sana (Sales Rep)",
    accountManager: "Ravi (Sales Manager)",
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
    salesExecutive: "Amit (Sales Rep)",
    accountManager: "Ravi (Sales Manager)",
    deliveryExecutive: "Kiran",
  },
];

const seedInventory = [
  { id: "inv1", name: "Buildesk CRM Pro", description: "Full CRM suite with contacts, pipeline, and reporting", itemType: "product", sku: "CRM-PRO-001", hsnSacCode: "998314", category: "CRM Suite", unitOfMeasure: "per license", costPrice: 8000, sellingPrice: 15000, taxRate: 18, isActive: 1, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: "Flagship product" },
  { id: "inv2", name: "ERP Integration Service", description: "One-time implementation and integration with existing ERP", itemType: "service", sku: "SVC-ERP-001", hsnSacCode: "998313", category: "ERP Platform", unitOfMeasure: "per hour", costPrice: 1200, sellingPrice: 2500, taxRate: 18, isActive: 1, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: null },
  { id: "inv3", name: "Analytics Add-on Annual", description: "Advanced analytics and BI dashboards", itemType: "subscription", sku: "SUB-ANAL-ANN", hsnSacCode: "998314", category: "Analytics Add-on", unitOfMeasure: "per year", costPrice: 24000, sellingPrice: 42000, taxRate: 18, isActive: 1, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: null },
  { id: "inv4", name: "Enterprise Bundle", description: "CRM + ERP + Analytics, annual commitment", itemType: "bundle", sku: "BND-ENT-001", hsnSacCode: "998314", category: "CRM Suite", unitOfMeasure: "per year", costPrice: 180000, sellingPrice: 320000, taxRate: 18, isActive: 1, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: null },
  { id: "inv5", name: "Support & AMC Monthly", description: "Monthly support and annual maintenance contract", itemType: "subscription", sku: "SUB-AMC-MON", hsnSacCode: "998313", category: "Support & AMC", unitOfMeasure: "per month", costPrice: 3000, sellingPrice: 5500, taxRate: 18, isActive: 1, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: null },
  { id: "inv6", name: "Implementation Services Pack", description: "On-site implementation and training", itemType: "service", sku: "SVC-IMPL-001", hsnSacCode: "998313", category: "Implementation Services", unitOfMeasure: "per unit", costPrice: 45000, sellingPrice: 75000, taxRate: 18, isActive: 1, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: null },
  { id: "inv7", name: "Storage Add-on (per GB)", description: "Additional cloud storage per GB per month", itemType: "subscription", sku: "SUB-STOR-GB", hsnSacCode: "998314", category: "Analytics Add-on", unitOfMeasure: "per GB", costPrice: 2, sellingPrice: 5, taxRate: 18, isActive: 1, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: null },
  { id: "inv8", name: "Legacy CRM Lite (Discontinued)", description: "Legacy lite version - no new sales", itemType: "product", sku: "CRM-LITE-OLD", hsnSacCode: "998314", category: "CRM Suite", unitOfMeasure: "per license", costPrice: 2000, sellingPrice: 3500, taxRate: 18, isActive: 0, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: "Discontinued" },
];

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
    createdByName: "Raj Bansal",
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
    createdByName: "Ravi Sharma",
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
  { id: "t1", name: "Enterprise North", regionId: "r1" },
  { id: "t2", name: "SMB West", regionId: "r2" },
  { id: "t3", name: "Support South", regionId: "r3" },
];

const seedUsers = [
  { id: "u1", name: "Raj Bansal", email: "raj@buildesk.in", password: "admin123", role: "super_admin", teamId: "t1", regionId: "r1", status: "active" },
  { id: "u2", name: "Ravi Sharma", email: "ravi@buildesk.in", password: "manager123", role: "sales_manager", teamId: "t1", regionId: "r1", status: "active" },
  { id: "u4", name: "Amit Verma", email: "amit@buildesk.in", password: "sales123", role: "sales_rep", teamId: "t1", regionId: "r2", status: "active" },
  { id: "u5", name: "Sana Khan", email: "sana@buildesk.in", password: "sales123", role: "sales_rep", teamId: "t2", regionId: "r2", status: "active" },
  { id: "u6", name: "Nidhi Gupta", email: "nidhi@buildesk.in", password: "finance123", role: "finance", teamId: "t2", regionId: "r2", status: "active" },
];

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

  const ppcCount = db.prepare("SELECT COUNT(*) AS c FROM payment_plan_catalog").get().c;
  if (ppcCount === 0) {
    const stmt = db.prepare(
      `INSERT INTO payment_plan_catalog (id, name, defaultBillingCycle, defaultGraceDays, suggestedInstallments, createdAt)
       VALUES (@id, @name, @defaultBillingCycle, @defaultGraceDays, @suggestedInstallments, @createdAt)`
    );
    db.transaction((rows) => rows.forEach((r) => stmt.run(r)))(seedPaymentPlanCatalog);
  }
}

seedIfEmpty();

export { db, SQLITE_PATH };
