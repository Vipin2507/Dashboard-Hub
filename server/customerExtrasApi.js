function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function mapNoteRow(row) {
  return {
    id: row.id,
    content: row.content,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProductLineRow(row) {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    itemName: row.item_name,
    sku: row.sku ?? "",
    itemType: row.item_type ?? "product",
    qty: Number(row.qty) || 0,
    unitPrice: Number(row.unit_price) || 0,
    taxRate: Number(row.tax_rate) || 0,
    purchasedAt: row.purchased_at,
    renewalDate: row.renewal_date ?? undefined,
    expiryDate: row.expiry_date ?? undefined,
    status: row.status ?? "active",
    dealId: row.deal_id ?? "",
    usageDetails: row.usage_details ?? undefined,
  };
}

function insertProductLine(db, customerId, input) {
  const inventoryItemId = String(input.inventoryItemId ?? input.inventory_item_id ?? "").trim();
  const itemName = String(input.itemName ?? input.item_name ?? "").trim();
  if (!inventoryItemId || !itemName) return null;

  const dealId = String(input.dealId ?? input.deal_id ?? "");
  const existing = db
    .prepare(
      `SELECT id FROM customer_product_lines
       WHERE customer_id = ? AND IFNULL(deal_id, '') = ? AND inventory_item_id = ?`,
    )
    .get(customerId, dealId, inventoryItemId);
  if (existing) {
    return db.prepare("SELECT * FROM customer_product_lines WHERE id = ?").get(existing.id);
  }

  const purchasedAt = String(input.purchasedAt ?? input.purchased_at ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const itemType = String(input.itemType ?? input.item_type ?? "product");
  let renewalDate = input.renewalDate ?? input.renewal_date ?? null;
  let expiryDate = input.expiryDate ?? input.expiry_date ?? null;
  if (!renewalDate && itemType === "subscription") {
    const d = new Date(`${purchasedAt}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      d.setFullYear(d.getFullYear() + 1);
      renewalDate = d.toISOString().slice(0, 10);
      if (!expiryDate) expiryDate = renewalDate;
    }
  }

  const row = {
    id: "cpl-" + makeId(),
    customer_id: customerId,
    inventory_item_id: inventoryItemId,
    item_name: itemName,
    sku: String(input.sku ?? ""),
    item_type: itemType,
    qty: Number(input.qty) || 1,
    unit_price: Number(input.unitPrice ?? input.unit_price) || 0,
    tax_rate: Number(input.taxRate ?? input.tax_rate) || 0,
    purchased_at: purchasedAt,
    renewal_date: renewalDate ? String(renewalDate) : null,
    expiry_date: expiryDate ? String(expiryDate) : null,
    status: String(input.status ?? "active"),
    deal_id: dealId || null,
    usage_details: input.usageDetails ?? input.usage_details ? String(input.usageDetails ?? input.usage_details) : null,
    created_at: new Date().toISOString(),
  };

  try {
    db.prepare(`
    INSERT INTO customer_product_lines (
      id, customer_id, inventory_item_id, item_name, sku, item_type, qty, unit_price, tax_rate,
      purchased_at, renewal_date, expiry_date, status, deal_id, usage_details, created_at
    ) VALUES (
      @id, @customer_id, @inventory_item_id, @item_name, @sku, @item_type, @qty, @unit_price, @tax_rate,
      @purchased_at, @renewal_date, @expiry_date, @status, @deal_id, @usage_details, @created_at
    )
  `).run(row);
    return row;
  } catch {
    const again = db
      .prepare(
        `SELECT * FROM customer_product_lines
         WHERE customer_id = ? AND IFNULL(deal_id, '') = ? AND inventory_item_id = ?`,
      )
      .get(customerId, dealId, inventoryItemId);
    return again ?? row;
  }
}

function backfillProductLinesFromProposals(db, customerId) {
  const rows = db.prepare("SELECT data FROM proposals WHERE customerId = ?").all(customerId);
  for (const r of rows) {
    let proposal = null;
    try {
      proposal = JSON.parse(r.data);
    } catch {
      proposal = null;
    }
    if (!proposal?.dealId || !Array.isArray(proposal.lineItems)) continue;
    for (const li of proposal.lineItems) {
      insertProductLine(db, customerId, {
        inventoryItemId: li.inventoryItemId,
        itemName: li.name,
        sku: li.sku,
        itemType: li.itemType,
        qty: li.qty,
        unitPrice: li.unitPrice,
        taxRate: li.taxRate,
        dealId: proposal.dealId,
        purchasedAt: String(proposal.updatedAt || proposal.createdAt || "").slice(0, 10) || undefined,
      });
    }
  }
}

function listProductLines(db, customerId) {
  backfillProductLinesFromProposals(db, customerId);
  return db
    .prepare("SELECT * FROM customer_product_lines WHERE customer_id = ? ORDER BY purchased_at DESC, created_at DESC")
    .all(customerId)
    .map(mapProductLineRow);
}

function mapAttachmentRow(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type ?? "",
    fileSize: row.file_size ?? "",
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    url: `/api/customers/${row.customer_id}/attachments/${row.id}/download`,
  };
}

export function migrateCustomerExtrasSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_notes (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id);

    CREATE TABLE IF NOT EXISTS customer_attachments (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_type TEXT,
      file_size TEXT,
      file_data TEXT,
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_attachments_customer ON customer_attachments(customer_id);

    CREATE TABLE IF NOT EXISTS customer_product_lines (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      inventory_item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      sku TEXT NOT NULL DEFAULT '',
      item_type TEXT NOT NULL DEFAULT 'product',
      qty REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      purchased_at TEXT NOT NULL,
      renewal_date TEXT,
      expiry_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      deal_id TEXT,
      usage_details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_product_lines_customer ON customer_product_lines(customer_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_product_lines_dedupe
      ON customer_product_lines(customer_id, IFNULL(deal_id, ''), inventory_item_id);
  `);
}

export function registerCustomerExtrasApi(app, db, helpers = {}) {
  const { broadcast } = helpers;

  migrateCustomerExtrasSchema(db);

  app.get("/api/customers/:id/notes-attachments", (req, res) => {
    const customerId = req.params.id;
    const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const notes = db
      .prepare("SELECT * FROM customer_notes WHERE customer_id = ? ORDER BY created_at DESC")
      .all(customerId)
      .map(mapNoteRow);

    const attachments = db
      .prepare("SELECT * FROM customer_attachments WHERE customer_id = ? ORDER BY uploaded_at DESC")
      .all(customerId)
      .map(mapAttachmentRow);

    res.json({ notes, attachments });
  });

  app.post("/api/customers/:id/notes", (req, res) => {
    const customerId = req.params.id;
    const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const { content, createdBy, createdByName } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: "content is required" });
    }
    if (!createdBy || !createdByName) {
      return res.status(400).json({ error: "createdBy and createdByName are required" });
    }

    const now = new Date().toISOString();
    const note = {
      id: "cn-" + makeId(),
      customer_id: customerId,
      content: String(content).trim(),
      created_by: String(createdBy),
      created_by_name: String(createdByName),
      created_at: now,
      updated_at: now,
    };

    db.prepare(`
      INSERT INTO customer_notes (id, customer_id, content, created_by, created_by_name, created_at, updated_at)
      VALUES (@id, @customer_id, @content, @created_by, @created_by_name, @created_at, @updated_at)
    `).run(note);

    broadcast?.({ type: "change", entity: "customers", action: "note_created", id: customerId });
    res.status(201).json(mapNoteRow(note));
  });

  app.put("/api/customers/:id/notes/:noteId", (req, res) => {
    const { id: customerId, noteId } = req.params;
    const existing = db
      .prepare("SELECT * FROM customer_notes WHERE id = ? AND customer_id = ?")
      .get(noteId, customerId);
    if (!existing) return res.status(404).json({ error: "Note not found" });

    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: "content is required" });
    }

    const updated_at = new Date().toISOString();
    db.prepare("UPDATE customer_notes SET content = ?, updated_at = ? WHERE id = ?").run(
      String(content).trim(),
      updated_at,
      noteId,
    );

    broadcast?.({ type: "change", entity: "customers", action: "note_updated", id: customerId });
    res.json(
      mapNoteRow({
        ...existing,
        content: String(content).trim(),
        updated_at,
      }),
    );
  });

  app.delete("/api/customers/:id/notes/:noteId", (req, res) => {
    const { id: customerId, noteId } = req.params;
    const existing = db
      .prepare("SELECT id FROM customer_notes WHERE id = ? AND customer_id = ?")
      .get(noteId, customerId);
    if (!existing) return res.status(404).json({ error: "Note not found" });

    db.prepare("DELETE FROM customer_notes WHERE id = ?").run(noteId);
    broadcast?.({ type: "change", entity: "customers", action: "note_deleted", id: customerId });
    res.status(204).end();
  });

  app.post("/api/customers/:id/attachments", (req, res) => {
    const customerId = req.params.id;
    const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const { fileName, fileType, fileSize, fileData, uploadedBy } = req.body || {};
    if (!fileName || !uploadedBy) {
      return res.status(400).json({ error: "fileName and uploadedBy are required" });
    }

    const now = new Date().toISOString();
    const attachment = {
      id: "ca-" + makeId(),
      customer_id: customerId,
      file_name: String(fileName),
      file_type: fileType ? String(fileType) : null,
      file_size: fileSize ? String(fileSize) : null,
      file_data: fileData ? String(fileData) : null,
      uploaded_by: String(uploadedBy),
      uploaded_at: now,
    };

    db.prepare(`
      INSERT INTO customer_attachments (id, customer_id, file_name, file_type, file_size, file_data, uploaded_by, uploaded_at)
      VALUES (@id, @customer_id, @file_name, @file_type, @file_size, @file_data, @uploaded_by, @uploaded_at)
    `).run(attachment);

    broadcast?.({ type: "change", entity: "customers", action: "attachment_created", id: customerId });
    res.status(201).json(mapAttachmentRow(attachment));
  });

  app.delete("/api/customers/:id/attachments/:attachmentId", (req, res) => {
    const { id: customerId, attachmentId } = req.params;
    const existing = db
      .prepare("SELECT id FROM customer_attachments WHERE id = ? AND customer_id = ?")
      .get(attachmentId, customerId);
    if (!existing) return res.status(404).json({ error: "Attachment not found" });

    db.prepare("DELETE FROM customer_attachments WHERE id = ?").run(attachmentId);
    broadcast?.({ type: "change", entity: "customers", action: "attachment_deleted", id: customerId });
    res.status(204).end();
  });

  app.get("/api/customers/:id/attachments/:attachmentId/download", (req, res) => {
    const { id: customerId, attachmentId } = req.params;
    const row = db
      .prepare("SELECT * FROM customer_attachments WHERE id = ? AND customer_id = ?")
      .get(attachmentId, customerId);
    if (!row) return res.status(404).json({ error: "Attachment not found" });
    if (!row.file_data) {
      return res.status(404).json({ error: "File content not available" });
    }

    const buffer = Buffer.from(row.file_data, "base64");
    res.setHeader("Content-Type", row.file_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${row.file_name}"`);
    res.send(buffer);
  });

  app.get("/api/customers/:id/product-lines", (req, res) => {
    const customerId = req.params.id;
    const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(listProductLines(db, customerId));
  });

  app.post("/api/customers/:id/product-lines", (req, res) => {
    const customerId = req.params.id;
    const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const row = insertProductLine(db, customerId, req.body || {});
    if (!row) return res.status(400).json({ error: "inventoryItemId and itemName are required" });
    broadcast?.({ type: "change", entity: "customers", action: "product_line_created", id: customerId });
    res.status(201).json(mapProductLineRow(row));
  });

  app.post("/api/customers/:id/product-lines/bulk", (req, res) => {
    const customerId = req.params.id;
    const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const inserted = [];
    for (const line of lines) {
      const row = insertProductLine(db, customerId, line);
      if (row) inserted.push(mapProductLineRow(row));
    }
    if (inserted.length) {
      broadcast?.({ type: "change", entity: "customers", action: "product_lines_synced", id: customerId });
    }
    res.status(201).json(inserted);
  });

  app.delete("/api/customers/:id/product-lines/:lineId", (req, res) => {
    const { id: customerId, lineId } = req.params;
    const existing = db
      .prepare("SELECT id FROM customer_product_lines WHERE id = ? AND customer_id = ?")
      .get(lineId, customerId);
    if (!existing) return res.status(404).json({ error: "Product line not found" });
    db.prepare("DELETE FROM customer_product_lines WHERE id = ?").run(lineId);
    broadcast?.({ type: "change", entity: "customers", action: "product_line_deleted", id: customerId });
    res.status(204).end();
  });
}
