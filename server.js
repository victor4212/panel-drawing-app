import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;
const app = express();

// ----- Middleware -----
app.use(express.json({ limit: "10mb" }));

// If you host frontend + backend in the same Render service, CORS is not needed.
// If you host frontend separately, set FRONTEND_URL in Render to that origin.
const FRONTEND_URL = process.env.FRONTEND_URL || "";
if (FRONTEND_URL) {
  app.use(cors({ origin: FRONTEND_URL }));
}

// ----- Postgres -----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ----- API -----
app.get("/api/health", (_, res) => res.json({ ok: true }));

// List (for left panel)
app.get("/api/drawings", async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);

  const sql = q
    ? `select part_number, notes, updated_at
       from panel_drawings
       where part_number ilike $1
       order by updated_at desc
       limit $2`
    : `select part_number, notes, updated_at
       from panel_drawings
       order by updated_at desc
       limit $1`;

  const params = q ? [`%${q}%`, limit] : [limit];

  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// Load one
app.get("/api/drawings/:partNumber", async (req, res) => {
  const { partNumber } = req.params;
  const { rows } = await pool.query(
    `select part_number, notes, state_json
     from panel_drawings
     where part_number = $1`,
    [partNumber]
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// Save (upsert)
app.post("/api/drawings", async (req, res) => {
  const { partNumber, notes, stateJson } = req.body || {};
  if (!partNumber || !stateJson) {
    return res.status(400).json({ error: "partNumber and stateJson required" });
  }

  const pn = String(partNumber).trim();
  const nt = String(notes || "");

  const { rows } = await pool.query(
    `insert into panel_drawings (part_number, notes, state_json)
     values ($1, $2, $3)
     on conflict (part_number)
     do update set
       notes = excluded.notes,
       state_json = excluded.state_json,
       updated_at = now()
     returning part_number, updated_at`,
    [pn, nt, stateJson]
  );

  res.json({ ok: true, saved: rows[0] });
});

// Delete
app.delete("/api/drawings/:partNumber", async (req, res) => {
  const { partNumber } = req.params;
  await pool.query(`delete from panel_drawings where part_number = $1`, [partNumber]);
  res.json({ ok: true });
});

// ----- Frontend -----
app.use(express.static("public"));

// Render provides PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on", PORT));
