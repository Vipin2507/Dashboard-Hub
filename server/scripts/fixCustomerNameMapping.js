import path from "path";
import Database from "better-sqlite3";

function looksLikeCompany(s) {
  const v = String(s || "").trim().toLowerCase();
  if (!v) return false;
  const needles = [
    "pvt",
    "private",
    "ltd",
    "llp",
    "llc",
    "inc",
    "corp",
    "corporation",
    "company",
    "co.",
    "group",
    "solutions",
    "technologies",
    "technology",
    "enterprise",
    "enterprises",
    "industries",
    "systems",
    "services",
    "associates",
  ];
  if (needles.some((n) => v.includes(n))) return true;
  if (/[&@]/.test(v)) return true;
  return false;
}

function looksLikePerson(s) {
  const v = String(s || "").trim();
  if (!v) return false;
  if (/\d/.test(v)) return false;
  if (looksLikeCompany(v)) return false;
  // at least first+last name usually
  return v.split(/\s+/).filter(Boolean).length >= 2;
}

function normalizeName(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function main() {
  const sqlitePath =
    process.env.SQLITE_PATH ||
    path.resolve(process.cwd(), "data", "app.db");

  const dryRun = process.argv.includes("--dry-run");
  const db = new Database(sqlitePath);

  const cols = db.prepare("PRAGMA table_info(customers)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("customerName") || !names.has("companyName")) {
    // eslint-disable-next-line no-console
    console.error("Missing customerName/companyName columns. Start server once to run migrations.");
    process.exit(1);
  }

  const rows = db.prepare("SELECT id, name, customerName, companyName, email FROM customers").all();
  const updates = [];

  for (const r of rows) {
    const legacy = normalizeName(r.name);
    const cn = normalizeName(r.customerName);
    const co = normalizeName(r.companyName);

    // If both missing, infer from legacy name
    if (!cn && !co) {
      if (looksLikeCompany(legacy) && !looksLikePerson(legacy)) {
        const inferredCompany = legacy;
        const inferredCustomer = "";
        updates.push({
          id: r.id,
          customerName: inferredCustomer,
          companyName: inferredCompany,
          name: inferredCompany,
          reason: "infer_company_from_legacy",
          before: { customerName: r.customerName, companyName: r.companyName, name: r.name },
          after: { customerName: inferredCustomer, companyName: inferredCompany, name: inferredCompany },
        });
      } else {
        const inferredCustomer = legacy || (r.email ? String(r.email).split("@")[0] : "Customer");
        const inferredCompany = "";
        updates.push({
          id: r.id,
          customerName: inferredCustomer,
          companyName: inferredCompany,
          name: inferredCustomer,
          reason: "infer_customer_from_legacy",
          before: { customerName: r.customerName, companyName: r.companyName, name: r.name },
          after: { customerName: inferredCustomer, companyName: inferredCompany, name: inferredCustomer },
        });
      }
      continue;
    }

    // If clearly swapped, swap them
    if (cn && co && looksLikeCompany(cn) && looksLikePerson(co)) {
      const nextCustomer = co;
      const nextCompany = cn;
      const nextName = nextCompany || nextCustomer || legacy;
      updates.push({
        id: r.id,
        customerName: nextCustomer,
        companyName: nextCompany,
        name: nextName,
        reason: "swap_swapped_fields",
        before: { customerName: r.customerName, companyName: r.companyName, name: r.name },
        after: { customerName: nextCustomer, companyName: nextCompany, name: nextName },
      });
      continue;
    }

    // Ensure legacy name stays synced for backward compat
    const nextName = co || cn || legacy;
    if (nextName !== legacy) {
      updates.push({
        id: r.id,
        customerName: r.customerName,
        companyName: r.companyName,
        name: nextName,
        reason: "sync_legacy_name",
        before: { customerName: r.customerName, companyName: r.companyName, name: r.name },
        after: { customerName: r.customerName, companyName: r.companyName, name: nextName },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[fixCustomerNameMapping] db=${sqlitePath}`);
  // eslint-disable-next-line no-console
  console.log(`[fixCustomerNameMapping] candidates=${updates.length} dryRun=${dryRun}`);

  if (!updates.length) return;

  const stmt = db.prepare(
    "UPDATE customers SET customerName = @customerName, companyName = @companyName, name = @name WHERE id = @id",
  );

  const run = db.transaction((items) => {
    for (const u of items) stmt.run(u);
  });

  if (!dryRun) run(updates);

  // Print JSONL to stdout for review.
  for (const u of updates) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        id: u.id,
        reason: u.reason,
        before: u.before,
        after: u.after,
      }),
    );
  }
}

main();

