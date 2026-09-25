CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS testimonials (id TEXT PRIMARY KEY, reviewer_name TEXT, attribution_label TEXT NOT NULL, text TEXT NOT NULL, rating INTEGER, status TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chronicles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', published_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS testimonials_status_idx ON testimonials(status);
CREATE INDEX IF NOT EXISTS chronicles_status_idx ON chronicles(status);
