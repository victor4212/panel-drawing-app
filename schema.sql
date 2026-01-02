-- Run this once in your Render Postgres database

create table if not exists panel_drawings (
  id bigserial primary key,
  part_number text not null unique,
  notes text default '',
  state_json jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_panel_drawings_part on panel_drawings(part_number);
