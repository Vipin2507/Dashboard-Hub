/**
 * Sales groups API — CRUD for Teams-tab groups with admin + members.
 */
export function registerGroupsApi(app, { db, broadcast }) {
  function makeId() {
    return Math.random().toString(36).slice(2, 10);
  }

  function parseJsonArray(raw) {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw !== "string" || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  function rowToGroup(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      teamId: row.teamId,
      adminUserId: row.adminUserId,
      memberUserIds: parseJsonArray(row.memberUserIds),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  function normalizeMembers(adminUserId, memberUserIds) {
    const set = new Set(
      (Array.isArray(memberUserIds) ? memberUserIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    );
    if (adminUserId) set.add(String(adminUserId));
    return [...set];
  }

  app.get("/api/groups", (_req, res) => {
    const rows = db.prepare("SELECT * FROM sales_groups ORDER BY name COLLATE NOCASE").all();
    res.json(rows.map(rowToGroup));
  });

  app.post("/api/groups", (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const teamId = String(body.teamId || "").trim();
    const adminUserId = String(body.adminUserId || "").trim();
    if (!name || !teamId || !adminUserId) {
      return res.status(400).json({ error: "name, teamId and adminUserId are required" });
    }
    const team = db.prepare("SELECT id FROM teams WHERE id = ?").get(teamId);
    if (!team) return res.status(400).json({ error: "Team not found" });
    const admin = db.prepare("SELECT id FROM users WHERE id = ?").get(adminUserId);
    if (!admin) return res.status(400).json({ error: "Admin user not found" });

    const now = new Date().toISOString();
    const id = "g" + makeId();
    const memberUserIds = normalizeMembers(adminUserId, body.memberUserIds);
    db.prepare(
      `INSERT INTO sales_groups (id, name, teamId, adminUserId, memberUserIds, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, name, teamId, adminUserId, JSON.stringify(memberUserIds), now, now);

    const group = rowToGroup(db.prepare("SELECT * FROM sales_groups WHERE id = ?").get(id));
    broadcast?.({ type: "change", entity: "groups", action: "created", id });
    res.status(201).json(group);
  });

  app.put("/api/groups/:id", (req, res) => {
    const existing = db.prepare("SELECT * FROM sales_groups WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const body = req.body || {};
    const name = String(body.name ?? existing.name).trim();
    const teamId = String(body.teamId ?? existing.teamId).trim();
    const adminUserId = String(body.adminUserId ?? existing.adminUserId).trim();
    if (!name || !teamId || !adminUserId) {
      return res.status(400).json({ error: "name, teamId and adminUserId are required" });
    }
    const team = db.prepare("SELECT id FROM teams WHERE id = ?").get(teamId);
    if (!team) return res.status(400).json({ error: "Team not found" });
    const admin = db.prepare("SELECT id FROM users WHERE id = ?").get(adminUserId);
    if (!admin) return res.status(400).json({ error: "Admin user not found" });

    const memberUserIds = normalizeMembers(
      adminUserId,
      body.memberUserIds !== undefined ? body.memberUserIds : parseJsonArray(existing.memberUserIds),
    );
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE sales_groups
       SET name = ?, teamId = ?, adminUserId = ?, memberUserIds = ?, updatedAt = ?
       WHERE id = ?`,
    ).run(name, teamId, adminUserId, JSON.stringify(memberUserIds), now, req.params.id);

    const group = rowToGroup(db.prepare("SELECT * FROM sales_groups WHERE id = ?").get(req.params.id));
    broadcast?.({ type: "change", entity: "groups", action: "updated", id: req.params.id });
    res.json(group);
  });

  app.delete("/api/groups/:id", (req, res) => {
    const existing = db.prepare("SELECT id FROM sales_groups WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    db.prepare("DELETE FROM sales_groups WHERE id = ?").run(req.params.id);
    broadcast?.({ type: "change", entity: "groups", action: "deleted", id: req.params.id });
    res.json({ ok: true });
  });
}
