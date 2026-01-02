# Panel Drawing (Three.js) - Render + Postgres

This project serves your existing single-file Three.js app from /public and adds a small API
that saves/loads drawings into PostgreSQL (JSONB).

## Files
- public/index.html  (your drawing app + DB panel under Notes)
- server.js          (Express API + static hosting)
- schema.sql         (create table)
- package.json

## Render setup (simple, users in/out)
1) Create **Render Postgres**
2) Run `schema.sql` in the database
3) Create a **Web Service** from this repo
4) Set Environment Variable:
   - DATABASE_URL = (Render Postgres connection string)
5) Deploy

Open your service URL. Use:
- "Save to DB" to store by Part Number
- Left list -> Edit/Delete
- "Load from DB" to load by Part Number

## Local run
npm install
npm start
Open http://localhost:3000
