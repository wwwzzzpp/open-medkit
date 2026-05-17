import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { normalizeAgrochemicalCategory } from '../agrochemical';
import { schema } from './schema';

export type SqliteDatabase = Database.Database;

let db: SqliteDatabase | null = null;

function ensureMedicineColumns(database: SqliteDatabase) {
  const columns = database.pragma('table_info(medicines)') as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('brand')) {
    database.prepare('ALTER TABLE medicines ADD COLUMN brand TEXT').run();
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
  db.exec(schema);
  ensureMedicineColumns(db);
  backfillAgrochemicalCategories(db);

  return db;
}
