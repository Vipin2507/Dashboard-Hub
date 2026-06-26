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
}
