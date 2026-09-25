-- Admin content management: richer testimonial and Chronicle fields plus an audit trail.
ALTER TABLE testimonials ADD COLUMN detail TEXT;
ALTER TABLE testimonials ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE testimonials ADD COLUMN created_at TEXT;

ALTER TABLE chronicles ADD COLUMN category TEXT;
ALTER TABLE chronicles ADD COLUMN kicker TEXT;
ALTER TABLE chronicles ADD COLUMN deck TEXT;
ALTER TABLE chronicles ADD COLUMN read_minutes INTEGER;
ALTER TABLE chronicles ADD COLUMN created_at TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log(at);
CREATE INDEX IF NOT EXISTS testimonials_sort_idx ON testimonials(sort_order);
