// server.js
import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;
const app = express();

/* -------------------- Middleware -------------------- */
app.use(express.json({ limit: "10mb" }));

// If frontend is served from this same service, CORS is not needed.
// If you later host frontend separately, set FRONTEND_URL in Render.
const FRONTEND_URL = process.env.FRONTEND_URL || "";
if (FRONTEND_URL) {
  app.use(cors({ origin: FRONTEND_URL }));
}

/* -------------------- Postgres -------------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

// Auto-create schema (FREE plan friendly)
async function ensureSchema() {
  await pool.query(`
    create table if not exists panel_drawings (
      id bigserial primary key,
      part_number text not null unique,
      notes text default '',
      state_json jsonb not null,
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_panel_drawings_part
      on panel_drawings(part_number);
  `);
  console.log("✅ DB schema ready");
}

// Run once on startup
ensureSchema().catch(err => {
  console.error("❌ Schema init failed:", err);
  process.exit(1);
});

/* -------------------- API -------------------- */

// Health check
app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

// List drawings (for left panel)
app.get("/api/drawings", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);

    const sql = q
      ? `
        select part_number, notes, updated_at
        from panel_drawings
        where part_number ilike $1
        order by updated_at desc
        limit $2
      `
      : `
        select part_number, notes, updated_at
        from panel_drawings
        order by updated_at desc
        limit $1
      `;

    const params = q ? [`%${q}%`, limit] : [limit];
    const { rows } = await pool.query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list drawings" });
  }
});

// Load one drawing
app.get("/api/drawings/:partNumber", async (req, res) => {
  try {
    const { partNumber } = req.params;

    const { rows } = await pool.query(
      `
      select part_number, notes, state_json
      from panel_drawings
      where part_number = $1
      `,
      [partNumber]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load drawing" });
  }
});

// Save or update drawing
app.post("/api/drawings", async (req, res) => {
  try {
    const { partNumber, notes, stateJson } = req.body || {};

    if (!partNumber || !stateJson) {
      return res.status(400).json({
        error: "partNumber and stateJson are required",
      });
    }

    const pn = String(partNumber).trim();
    const nt = String(notes || "");

    const { rows } = await pool.query(
      `
      insert into panel_drawings (part_number, notes, state_json)
      values ($1, $2, $3)
      on conflict (part_number)
      do update set
        notes = excluded.notes,
        state_json = excluded.state_json,
        updated_at = now()
      returning part_number, updated_at
      `,
      [pn, nt, stateJson]
    );

    res.json({ ok: true, saved: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save drawing" });
  }
});

// Delete drawing
app.delete("/api/drawings/:partNumber", async (req, res) => {
  try {
    const { partNumber } = req.params;

    await pool.query(
      `delete from panel_drawings where part_number = $1`,
      [partNumber]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete drawing" });
  }
});

/* -------------------- Frontend -------------------- */
// Serve your Three.js app
app.use(express.static("public"));

/* -------------------- Start server -------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
