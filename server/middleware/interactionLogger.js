export function attachInteractionLogger(db) {
  return (req, _res, next) => {
    req.logInteraction = (entry) => {
      try {
        const now = new Date().toISOString();
        const row = {
          id: entry.id || "h" + Math.random().toString(36).slice(2, 10),
          customerId: entry.customerId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          channel: entry.channel,
          direction: entry.direction || "system",
          summary: entry.summary || null,
          payloadJson: entry.payloadJson ? JSON.stringify(entry.payloadJson) : null,
          performedBy: entry.performedBy || null,
          performedByName: entry.performedByName || null,
          at: entry.at || now,
        };
        if (!row.customerId || !row.entityType || !row.entityId || !row.channel) return;
        db.prepare(
          `INSERT INTO central_history_db
           (id, customerId, entityType, entityId, channel, direction, summary, payloadJson, performedBy, performedByName, at)
           VALUES (@id, @customerId, @entityType, @entityId, @channel, @direction, @summary, @payloadJson, @performedBy, @performedByName, @at)`,
        ).run(row);
      } catch {
        // ignore logging failures
      }
    };
    next();
  };
}

