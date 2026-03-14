import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// In-memory demo data for customers.
// Mirrors src/lib/seed.ts -> seedCustomers.
let customers = [
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

// In-memory inventory (mirrors src/lib/seed.ts -> seedInventoryItems)
const seedNow = "2026-03-01T10:00:00Z";
let inventory = [
  { id: "inv1", name: "Buildesk CRM Pro", description: "Full CRM suite with contacts, pipeline, and reporting", itemType: "product", sku: "CRM-PRO-001", hsnSacCode: "998314", category: "CRM Suite", unitOfMeasure: "per license", costPrice: 8000, sellingPrice: 15000, taxRate: 18, isActive: true, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: "Flagship product" },
  { id: "inv2", name: "ERP Integration Service", description: "One-time implementation and integration with existing ERP", itemType: "service", sku: "SVC-ERP-001", hsnSacCode: "998313", category: "ERP Platform", unitOfMeasure: "per hour", costPrice: 1200, sellingPrice: 2500, taxRate: 18, isActive: true, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1" },
  { id: "inv3", name: "Analytics Add-on Annual", description: "Advanced analytics and BI dashboards", itemType: "subscription", sku: "SUB-ANAL-ANN", hsnSacCode: "998314", category: "Analytics Add-on", unitOfMeasure: "per year", costPrice: 24000, sellingPrice: 42000, taxRate: 18, isActive: true, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1" },
  { id: "inv4", name: "Enterprise Bundle", description: "CRM + ERP + Analytics, annual commitment", itemType: "bundle", sku: "BND-ENT-001", hsnSacCode: "998314", category: "CRM Suite", unitOfMeasure: "per year", costPrice: 180000, sellingPrice: 320000, taxRate: 18, isActive: true, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1" },
  { id: "inv5", name: "Support & AMC Monthly", description: "Monthly support and annual maintenance contract", itemType: "subscription", sku: "SUB-AMC-MON", hsnSacCode: "998313", category: "Support & AMC", unitOfMeasure: "per month", costPrice: 3000, sellingPrice: 5500, taxRate: 18, isActive: true, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1" },
  { id: "inv6", name: "Implementation Services Pack", description: "On-site implementation and training", itemType: "service", sku: "SVC-IMPL-001", hsnSacCode: "998313", category: "Implementation Services", unitOfMeasure: "per unit", costPrice: 45000, sellingPrice: 75000, taxRate: 18, isActive: true, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1" },
  { id: "inv7", name: "Storage Add-on (per GB)", description: "Additional cloud storage per GB per month", itemType: "subscription", sku: "SUB-STOR-GB", hsnSacCode: "998314", category: "Analytics Add-on", unitOfMeasure: "per GB", costPrice: 2, sellingPrice: 5, taxRate: 18, isActive: true, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1" },
  { id: "inv8", name: "Legacy CRM Lite (Discontinued)", description: "Legacy lite version - no new sales", itemType: "product", sku: "CRM-LITE-OLD", hsnSacCode: "998314", category: "CRM Suite", unitOfMeasure: "per license", costPrice: 2000, sellingPrice: 3500, taxRate: 18, isActive: false, createdAt: seedNow, updatedAt: seedNow, createdBy: "u1", notes: "Discontinued" },
];

let masters = {
  productCategories: [
    { id: "mc1", name: "CRM Suite", type: "product_category" },
    { id: "mc2", name: "ERP Platform", type: "product_category" },
    { id: "mc3", name: "Analytics Add-on", type: "product_category" },
  ],
  subscriptionTypes: [
    { id: "ms1", name: "Monthly", type: "subscription_type" },
    { id: "ms2", name: "Annual", type: "subscription_type" },
  ],
  proposalFormats: [
    { id: "mf1", name: "Standard", type: "proposal_format" },
    { id: "mf2", name: "Enterprise", type: "proposal_format" },
  ],
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Customers API
app.get("/api/customers", (_req, res) => {
  res.json(customers);
});

app.post("/api/customers", (req, res) => {
  const {
    name,
    state,
    gstin,
    regionId,
    leadId,
    city,
    email,
    primaryPhone,
    status,
    salesExecutive,
    accountManager,
    deliveryExecutive,
  } = req.body || {};
  if (!name || !regionId) {
    return res.status(400).json({ error: "name and regionId are required" });
  }
  const id = "c" + makeId();
  const customer = {
    id,
    leadId: leadId || `L-${makeId()}`,
    name,
    state: state || "Unknown",
    gstin: gstin ?? null,
    regionId,
    city: city || null,
    email: email || null,
    primaryPhone: primaryPhone || null,
    status: status || "active",
    createdAt: new Date().toISOString(),
    salesExecutive: salesExecutive || null,
    accountManager: accountManager || null,
    deliveryExecutive: deliveryExecutive || null,
  };
  customers.push(customer);
  res.status(201).json(customer);
});

app.post("/api/customers/bulk", (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const created = items
    .filter((it) => it && it.name && it.regionId)
    .map((it) => ({
      id: "c" + makeId(),
      leadId: it.leadId || `L-${makeId()}`,
      name: it.name,
      state: it.state || "Unknown",
      gstin: it.gstin ?? null,
      regionId: it.regionId,
      city: it.city || null,
      email: it.email || null,
      primaryPhone: it.primaryPhone || null,
      status: it.status || "active",
      createdAt: new Date().toISOString(),
      salesExecutive: it.salesExecutive || null,
      accountManager: it.accountManager || null,
      deliveryExecutive: it.deliveryExecutive || null,
    }));

  customers = customers.concat(created);
  res.status(201).json(created);
});

// Master data API
app.get("/api/masters/product-categories", (_req, res) => {
  res.json(masters.productCategories);
});

app.post("/api/masters/product-categories", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const item = { id: "mc" + makeId(), name, type: "product_category" };
  masters.productCategories.push(item);
  res.status(201).json(item);
});

app.delete("/api/masters/product-categories/:id", (req, res) => {
  const { id } = req.params;
  masters.productCategories = masters.productCategories.filter((m) => m.id !== id);
  res.json({ ok: true });
});

app.get("/api/masters/subscription-types", (_req, res) => {
  res.json(masters.subscriptionTypes);
});

app.post("/api/masters/subscription-types", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const item = { id: "ms" + makeId(), name, type: "subscription_type" };
  masters.subscriptionTypes.push(item);
  res.status(201).json(item);
});

app.delete("/api/masters/subscription-types/:id", (req, res) => {
  const { id } = req.params;
  masters.subscriptionTypes = masters.subscriptionTypes.filter((m) => m.id !== id);
  res.json({ ok: true });
});

app.get("/api/masters/proposal-formats", (_req, res) => {
  res.json(masters.proposalFormats);
});

app.post("/api/masters/proposal-formats", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const item = { id: "mf" + makeId(), name, type: "proposal_format" };
  masters.proposalFormats.push(item);
  res.status(201).json(item);
});

app.delete("/api/masters/proposal-formats/:id", (req, res) => {
  const { id } = req.params;
  masters.proposalFormats = masters.proposalFormats.filter((m) => m.id !== id);
  res.json({ ok: true });
});

// Inventory CRUD API
app.get("/api/inventory", (_req, res) => {
  res.json(inventory);
});

app.get("/api/inventory/:id", (req, res) => {
  const item = inventory.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

app.post("/api/inventory", (req, res) => {
  const {
    name,
    description,
    itemType,
    sku,
    hsnSacCode,
    category,
    unitOfMeasure,
    costPrice,
    sellingPrice,
    taxRate,
    isActive,
    createdBy,
    notes,
  } = req.body || {};
  if (!name || !sku || !category || unitOfMeasure == null) {
    return res.status(400).json({ error: "name, sku, category, and unitOfMeasure are required" });
  }
  if (inventory.some((i) => i.sku.toUpperCase() === String(sku).trim().toUpperCase())) {
    return res.status(400).json({ error: "SKU already exists" });
  }
  const id = "inv" + makeId();
  const now = new Date().toISOString();
  const item = {
    id,
    name,
    description: description || undefined,
    itemType: itemType || "product",
    sku: String(sku).trim(),
    hsnSacCode: hsnSacCode || undefined,
    category,
    unitOfMeasure,
    costPrice: Number(costPrice) ?? 0,
    sellingPrice: Number(sellingPrice) ?? 0,
    taxRate: Number(taxRate) ?? 18,
    isActive: isActive !== false,
    createdAt: now,
    updatedAt: now,
    createdBy: createdBy || "u1",
    notes: notes || undefined,
  };
  inventory.push(item);
  res.status(201).json(item);
});

app.put("/api/inventory/:id", (req, res) => {
  const idx = inventory.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const existing = inventory[idx];
  const {
    name,
    description,
    itemType,
    sku,
    hsnSacCode,
    category,
    unitOfMeasure,
    costPrice,
    sellingPrice,
    taxRate,
    isActive,
    notes,
  } = req.body || {};
  if (sku !== undefined && sku !== existing.sku && inventory.some((i) => i.sku.toUpperCase() === String(sku).trim().toUpperCase()))) {
    return res.status(400).json({ error: "SKU already exists" });
  }
  const now = new Date().toISOString();
  const item = {
    ...existing,
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(itemType !== undefined && { itemType }),
    ...(sku !== undefined && { sku: String(sku).trim() }),
    ...(hsnSacCode !== undefined && { hsnSacCode: hsnSacCode || undefined }),
    ...(category !== undefined && { category }),
    ...(unitOfMeasure !== undefined && { unitOfMeasure }),
    ...(costPrice !== undefined && { costPrice: Number(costPrice) }),
    ...(sellingPrice !== undefined && { sellingPrice: Number(sellingPrice) }),
    ...(taxRate !== undefined && { taxRate: Number(taxRate) }),
    ...(isActive !== undefined && { isActive: !!isActive }),
    ...(notes !== undefined && { notes: notes || undefined }),
    updatedAt: now,
  };
  inventory[idx] = item;
  res.json(item);
});

app.delete("/api/inventory/:id", (req, res) => {
  const idx = inventory.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  inventory = inventory.filter((i) => i.id !== req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${PORT}`);
});


