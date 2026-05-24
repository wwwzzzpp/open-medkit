import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { normalizeAgrochemicalCategory } from '../agrochemical';
import { schema } from './schema';

export type SqliteDatabase = Database.Database;

let db: SqliteDatabase | null = null;

function ensureSchemaMigrations(database: SqliteDatabase) {
  // Check if we need to migrate to multi-user
  const columns = database.pragma('table_info(medicines)') as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('brand')) {
    database.prepare('ALTER TABLE medicines ADD COLUMN brand TEXT').run();
  }

  if (!columnNames.has('user_id')) {
    console.log('[DB] Migrating database to multi-user schema...');
    
    // Create a default admin user (password: admin123)
    // Hash for 'admin123' generated with argon2id
    const defaultPasswordHash = '$argon2id$v=19$m=65536,t=3,p=4$Gj6c+0eXh+sM2bA8hJvT/Q$XyD0/X0E5+xU0xO/w6z+BwQ2M2L8v6Z0/G5q3/1s2kQ';
    
    // Check if user 1 exists, if not insert
    const userExists = database.prepare('SELECT id FROM users WHERE id = 1').get();
    if (!userExists) {
      database.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, \'admin\', ?)').run(defaultPasswordHash);
      console.log('[DB] Created default user: admin / admin123');
    }

    // Add user_id to tables
    database.prepare('ALTER TABLE medicines ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1').run();
    database.prepare('ALTER TABLE inventory_transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1').run();
    database.prepare('ALTER TABLE inventory_batches ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1').run();
    
    // notification_channels and app_settings might have primary key conflicts if we just add a column,
    // since SQLite doesn't easily let us change primary keys without recreating tables.
    // Let's recreate notification_channels and app_settings to include user_id in PK.
    database.transaction(() => {
      // Recreate notification_channels
      database.prepare('CREATE TABLE notification_channels_new (user_id INTEGER NOT NULL DEFAULT 1, channel_type TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, config TEXT NOT NULL DEFAULT "{}", notify_hour INTEGER NOT NULL DEFAULT 9, last_notified_date TEXT, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')), updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')), PRIMARY KEY (user_id, channel_type), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)').run();
      database.prepare('INSERT INTO notification_channels_new (channel_type, enabled, config, notify_hour, last_notified_date, created_at, updated_at) SELECT channel_type, enabled, config, notify_hour, last_notified_date, created_at, updated_at FROM notification_channels').run();
      database.prepare('DROP TABLE notification_channels').run();
      database.prepare('ALTER TABLE notification_channels_new RENAME TO notification_channels').run();

      // Recreate app_settings
      database.prepare('CREATE TABLE app_settings_new (user_id INTEGER NOT NULL DEFAULT 1, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (user_id, key), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)').run();
      database.prepare('INSERT INTO app_settings_new (key, value) SELECT key, value FROM app_settings').run();
      database.prepare('DROP TABLE app_settings').run();
      database.prepare('ALTER TABLE app_settings_new RENAME TO app_settings').run();
    })();
  }
}

function backfillAgrochemicalCategories(database: SqliteDatabase) {
  const rows = database
    .prepare(
      `SELECT id, name, brand, name_en, spec, category, usage_desc, notes
       FROM medicines`,
    )
    .all() as Array<{
    id: number;
    name: string;
    brand: string | null;
    name_en: string | null;
    spec: string | null;
    category: string | null;
    usage_desc: string | null;
    notes: string | null;
  }>;

  const update = database.prepare('UPDATE medicines SET category = ? WHERE id = ?');
  const transaction = database.transaction(() => {
    rows.forEach((row) => {
      const normalized = normalizeAgrochemicalCategory(
        row.category,
        row.name,
        row.brand,
        row.name_en,
        row.spec,
        row.usage_desc,
        row.notes,
      );

      if (normalized && normalized !== (row.category || '')) {
        update.run(normalized, row.id);
      }
    });
  });

  transaction();
}

export function getDb(): SqliteDatabase {
  if (db) {
    return db;
  }

  const dbPath = process.env.DB_PATH || './data/medicine.db';
  const fullPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  db = new Database(fullPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const medicinesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='medicines'").get();
  if (medicinesExists) {
    ensureSchemaMigrations(db);
  }
  
  db.exec(schema);
  
  if (!medicinesExists) {
    ensureSchemaMigrations(db); // Create default user
  }

  backfillAgrochemicalCategories(db);

  return db;
}
