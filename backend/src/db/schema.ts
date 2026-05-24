import { AGROCHEMICAL_CATEGORIES } from '../agrochemical';

export const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medicines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  name        TEXT NOT NULL,
  brand       TEXT,
  name_en     TEXT,
  spec        TEXT,
  quantity    TEXT,
  expires_at  TEXT,
  category    TEXT,
  usage_desc  TEXT,
  location    TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS medicines_user_id ON medicines (user_id);

CREATE TRIGGER IF NOT EXISTS medicines_updated_at
AFTER UPDATE ON medicines
BEGIN
  UPDATE medicines SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  medicine_id     INTEGER,
  medicine_name   TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  quantity_before TEXT,
  quantity_after  TEXT,
  quantity_delta  TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',
  reason          TEXT,
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS inventory_transactions_user_id_created_at
ON inventory_transactions (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS inventory_transactions_medicine_id_created_at
ON inventory_transactions (medicine_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  medicine_id     INTEGER NOT NULL,
  batch_no        TEXT,
  production_date TEXT,
  expires_at      TEXT,
  quantity        TEXT,
  purchase_date   TEXT,
  supplier        TEXT,
  location        TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS inventory_batches_medicine_id_expires_at
ON inventory_batches (medicine_id, expires_at ASC, id ASC);

CREATE TRIGGER IF NOT EXISTS inventory_batches_updated_at
AFTER UPDATE ON inventory_batches
BEGIN
  UPDATE inventory_batches SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS notification_channels (
  user_id            INTEGER NOT NULL,
  channel_type       TEXT NOT NULL,
  enabled            INTEGER NOT NULL DEFAULT 0,
  config             TEXT NOT NULL DEFAULT '{}',
  notify_hour        INTEGER NOT NULL DEFAULT 9,
  last_notified_date TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, channel_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS notification_channels_updated_at
AFTER UPDATE ON notification_channels
BEGIN
  UPDATE notification_channels SET updated_at = datetime('now') WHERE user_id = NEW.user_id AND channel_type = NEW.channel_type;
END;

CREATE TABLE IF NOT EXISTS app_settings (
  user_id INTEGER NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const DEFAULT_CATEGORIES = [...AGROCHEMICAL_CATEGORIES];
