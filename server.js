// server.js
const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "25mb" })); // allow thumbnails/dataURLs

// Render provides DATABASE_URL automatically when you attach a Render Postgres.
// Locally you can set DATABASE_URL in your env if you want.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parts (
      part_number TEXT PRIMARY KEY,
      state_json  JSONB NOT NULL,
      spec_json   JSONB,
      thumbnail   TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function safeLike(s) {
  // escape % and _ for LIKE searches
  return s.replace(/[%_]/g, (m) => "\\" + m);
}

// --- API ---

// List parts (optional search)
// GET /api/parts?search=400123
app.get("/api/parts", async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    if (!search) {
      const { rows } = await pool.query(
        `SELECT part_number, updated_at, thumbnail
         FROM parts
         ORDER BY updated_at DESC
         LIMIT 200;`
      );
      return res.json(rows);
    }

    const like = `%${safeLike(search)}%`;
    const { rows } = await pool.query(
      `SELECT part_number, updated_at, thumbnail
       FROM parts
       WHERE part_number ILIKE $1 ESCAPE '\\'
       ORDER BY updated_at DESC
       LIMIT 200;`,
      [like]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list parts" });
  }
});

// Get one part
// GET /api/parts/:partNumber
app.get("/api/parts/:partNumber", async (req, res) => {
  try {
    const pn = req.params.partNumber;
    const { rows } = await pool.query(
      `SELECT part_number, state_json, spec_json, thumbnail, updated_at
       FROM parts
       WHERE part_number = $1;`,
      [pn]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch part" });
  }
});

// Upsert (save) part
// PUT /api/parts/:partNumber
// body: { state_json: object, spec_json: object|null, thumbnail: string|null }
app.put("/api/parts/:partNumber", async (req, res) => {
  try {
    const pn = (req.params.partNumber || "").trim();
    if (!pn) return res.status(400).json({ error: "Part number required" });

    const { state_json, spec_json, thumbnail } = req.body || {};
    if (!state_json) return res.status(400).json({ error: "state_json required" });

    await pool.query(
      `INSERT INTO parts(part_number, state_json, spec_json, thumbnail, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (part_number)
       DO UPDATE SET
         state_json = EXCLUDED.state_json,
         spec_json = EXCLUDED.spec_json,
         thumbnail = EXCLUDED.thumbnail,
         updated_at = NOW();`,
      [pn, state_json, spec_json || null, thumbnail || null]
    );

    res.json({ ok: true, part_number: pn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save part" });
  }
});

// Delete part
// DELETE /api/parts/:partNumber
app.delete("/api/parts/:partNumber", async (req, res) => {
  try {
    const pn = req.params.partNumber;
    await pool.query(`DELETE FROM parts WHERE part_number = $1;`, [pn]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete part" });
  }
});

// --- Static app ---
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

const PORT = process.env.PORT || 10000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log("Server running on port", PORT));
  })
  .catch((e) => {
    console.error("DB init failed:", e);
    process.exit(1);
  });
