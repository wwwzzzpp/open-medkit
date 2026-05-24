const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend/src/routes/medicines.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add userId parameter to helper function
content = content.replace(
  /function getExistingMedicine\(db: ReturnType<typeof getDb>, id: number\) \{/,
  "function getExistingMedicine(db: ReturnType<typeof getDb>, id: number, userId: number) {"
);
content = content.replace(
  /SELECT \* FROM medicines WHERE id = \?'\)\n\s*\.get\(id\)/g,
  "SELECT * FROM medicines WHERE id = ? AND user_id = ?')\n    .get(id, userId)"
);

// medicinesRouter.get('/')
content = content.replace(
  /const category = c\.req\.query\('category'\);/,
  "const userId = c.get('userId');\n    const category = c.req.query('category');"
);
content = content.replace(
  /const conditions: string\[\] = \[\];/,
  "const conditions: string[] = ['user_id = ?'];\n    const params: (string|number)[] = [userId];"
);
content = content.replace(
  /\.all\(\.\.\.params\)/,
  ".all(...params)"
); // Typescript array spread of mixed string/number is fine if params is any[] or (string|number)[]

// medicinesRouter.get('/stats')
content = content.replace(
  /const expiringDays = normalizeExpiringDays\(c\.req\.query\('expiringDays'\)\);/,
  "const userId = c.get('userId');\n    const expiringDays = normalizeExpiringDays(c.req.query('expiringDays'));"
);
content = content.replace(
  /FROM medicines\n\s*`/,
  "FROM medicines\n          WHERE user_id = ?\n        `"
);
content = content.replace(
  /\.get\(todayStr, todayStr, warningDateStr, warningDateStr\)/,
  ".get(todayStr, todayStr, warningDateStr, warningDateStr, userId)"
);
content = content.replace(
  /WHERE category IS NOT NULL AND category != ''/,
  "WHERE user_id = ? AND category IS NOT NULL AND category != ''"
);
content = content.replace(
  /\.all\(\) as { category: string; count: number }\[\];/,
  ".all(userId) as { category: string; count: number }[];"
);

// medicinesRouter.get('/export')
content = content.replace(
  /const medicines = db\n\s*\.prepare\('SELECT \* FROM medicines ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC'\)\n\s*\.all\(\) as MedicineRecord\[\];/,
  "const userId = c.get('userId');\n    const medicines = db\n      .prepare('SELECT * FROM medicines WHERE user_id = ? ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC')\n      .all(userId) as MedicineRecord[];"
);

// medicinesRouter.post('/import')
content = content.replace(
  /const importedRows = Array\.isArray\(body\?\.medicines\)/,
  "const userId = c.get('userId');\n    const importedRows = Array.isArray(body?.medicines)"
);
content = content.replace(
  /INSERT INTO medicines\n\s*\(name, brand, name_en, spec, quantity, expires_at, category, usage_desc, location, notes\)\n\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/,
  "INSERT INTO medicines\n        (user_id, name, brand, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
content = content.replace(
  /insert\.run\(\n\s*normalized\.name,/,
  "insert.run(\n            userId,\n            normalized.name,"
);
content = content.replace(
  /medicineId: Number\(result\.lastInsertRowid\),/,
  "userId,\n            medicineId: Number(result.lastInsertRowid),"
);

// medicinesRouter.get('/categories')
content = content.replace(
  /const categories = db\n\s*\.prepare\(\n\s*`\n\s*SELECT DISTINCT category\n\s*FROM medicines\n\s*WHERE category IS NOT NULL AND category != ''\n\s*ORDER BY category ASC\n\s*`\n\s*\)\n\s*\.all\(\) as { category: string }\[\];/,
  "const userId = c.get('userId');\n    const categories = db\n      .prepare(\n        `\n          SELECT DISTINCT category\n          FROM medicines\n          WHERE user_id = ? AND category IS NOT NULL AND category != ''\n          ORDER BY category ASC\n        `\n      )\n      .all(userId) as { category: string }[];"
);

// medicinesRouter.get('/:id/transactions')
content = content.replace(
  /const limit = Number\(c\.req\.query\('limit'\) \|\| 30\);/,
  "const userId = c.get('userId');\n    const limit = Number(c.req.query('limit') || 30);"
);
content = content.replace(
  /SELECT id FROM medicines WHERE id = \?'\)\n\s*\.get\(id\)/,
  "SELECT id FROM medicines WHERE id = ? AND user_id = ?')\n      .get(id, userId)"
);
content = content.replace(
  /listInventoryTransactions\(db, id, limit\)/,
  "listInventoryTransactions(db, userId, id, limit)"
);

// medicinesRouter.get('/:id/batches')
content = content.replace(
  /const id = Number\(c\.req\.param\('id'\)\);/,
  "const userId = c.get('userId');\n    const id = Number(c.req.param('id'));"
);
content = content.replace(
  /getExistingMedicine\(db, id\)/g,
  "getExistingMedicine(db, id, userId)"
);
content = content.replace(
  /SELECT \*\n\s*FROM inventory_batches\n\s*WHERE medicine_id = \?/,
  "SELECT *\n          FROM inventory_batches\n          WHERE user_id = ? AND medicine_id = ?"
);
content = content.replace(
  /\.all\(\s*id\s*\)/g,
  ".all(userId, id)"
);

// medicinesRouter.post('/:id/batches')
content = content.replace(
  /const payload = normalizeBatchInput/,
  "const userId = c.get('userId');\n    const payload = normalizeBatchInput"
);
content = content.replace(
  /INSERT INTO inventory_batches\n\s*\(medicine_id, batch_no, production_date, expires_at, quantity, purchase_date, supplier, location, notes\)\n\s*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)/,
  "INSERT INTO inventory_batches\n          (user_id, medicine_id, batch_no, production_date, expires_at, quantity, purchase_date, supplier, location, notes)\n          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
content = content.replace(
  /\.run\(\n\s*id,/,
  ".run(\n        userId,\n        id,"
);
content = content.replace(
  /medicineId: id,/,
  "userId,\n        medicineId: id,"
);
content = content.replace(
  /SELECT \* FROM inventory_batches WHERE id = \?'\)\n\s*\.get\(result\.lastInsertRowid\)/,
  "SELECT * FROM inventory_batches WHERE id = ? AND user_id = ?')\n      .get(result.lastInsertRowid, userId)"
);

// medicinesRouter.put('/:id/batches/:batchId')
content = content.replace(
  /const batchId = Number\(c\.req\.param\('batchId'\)\);/,
  "const userId = c.get('userId');\n    const batchId = Number(c.req.param('batchId'));"
);
content = content.replace(
  /SELECT \* FROM inventory_batches WHERE id = \? AND medicine_id = \?'\)\n\s*\.get\(batchId, id\)/g,
  "SELECT * FROM inventory_batches WHERE id = ? AND user_id = ? AND medicine_id = ?')\n      .get(batchId, userId, id)"
);
content = content.replace(
  /UPDATE inventory_batches\n\s*SET batch_no = \?, production_date = \?, expires_at = \?, quantity = \?, purchase_date = \?, supplier = \?, location = \?, notes = \?\n\s*WHERE id = \? AND medicine_id = \?/,
  "UPDATE inventory_batches\n        SET batch_no = ?, production_date = ?, expires_at = ?, quantity = ?, purchase_date = ?, supplier = ?, location = ?, notes = ?\n        WHERE id = ? AND user_id = ? AND medicine_id = ?"
);
content = content.replace(
  /batchId,\n\s*id,/,
  "batchId,\n      userId,\n      id,"
);
content = content.replace(
  /SELECT \* FROM inventory_batches WHERE id = \?'\)\n\s*\.get\(batchId\)/g,
  "SELECT * FROM inventory_batches WHERE id = ? AND user_id = ?')\n      .get(batchId, userId)"
);

// medicinesRouter.delete('/:id/batches/:batchId')
content = content.replace(
  /DELETE FROM inventory_batches WHERE id = \? AND medicine_id = \?'\)\.run\(batchId, id\)/,
  "DELETE FROM inventory_batches WHERE id = ? AND user_id = ? AND medicine_id = ?').run(batchId, userId, id)"
);

// medicinesRouter.get('/:id') handled by getExistingMedicine replace above except here it's inline
content = content.replace(
  /medicinesRouter\.get\('\/:id', \(c\) => \{/,
  "medicinesRouter.get('/:id', (c) => {\n  const userId = c.get('userId');"
);

// medicinesRouter.post('/')
content = content.replace(
  /medicinesRouter\.post\('\/', async \(c\) => \{/,
  "medicinesRouter.post('/', async (c) => {\n  const userId = c.get('userId');"
);
content = content.replace(
  /const medicine = db\n\s*\.prepare\('SELECT \* FROM medicines WHERE id = \?'\)\n\s*\.get\(result\.lastInsertRowid\) as MedicineRecord;/,
  "const medicine = db\n      .prepare('SELECT * FROM medicines WHERE id = ? AND user_id = ?')\n      .get(result.lastInsertRowid, userId) as MedicineRecord;"
);

// medicinesRouter.put('/:id')
content = content.replace(
  /medicinesRouter\.put\('\/:id', async \(c\) => \{/,
  "medicinesRouter.put('/:id', async (c) => {\n  const userId = c.get('userId');"
);
content = content.replace(
  /UPDATE medicines\n\s*SET name = \?, brand = \?, name_en = \?, spec = \?, quantity = \?, expires_at = \?, category = \?, usage_desc = \?, location = \?, notes = \?\n\s*WHERE id = \?/,
  "UPDATE medicines\n        SET name = ?, brand = ?, name_en = ?, spec = ?, quantity = ?, expires_at = ?, category = ?, usage_desc = ?, location = ?, notes = ?\n        WHERE id = ? AND user_id = ?"
);
content = content.replace(
  /payload\.notes \|\| null,\n\s*id/,
  "payload.notes || null,\n      id,\n      userId"
);
content = content.replace(
  /const medicine = db\n\s*\.prepare\('SELECT \* FROM medicines WHERE id = \?'\)\n\s*\.get\(id\) as MedicineRecord;/,
  "const medicine = db\n      .prepare('SELECT * FROM medicines WHERE id = ? AND user_id = ?')\n      .get(id, userId) as MedicineRecord;"
);

// medicinesRouter.delete('/:id')
content = content.replace(
  /medicinesRouter\.delete\('\/:id', \(c\) => \{/,
  "medicinesRouter.delete('/:id', (c) => {\n  const userId = c.get('userId');"
);
content = content.replace(
  /const result = db\.prepare\('DELETE FROM medicines WHERE id = \?'\)\.run\(id\);/,
  "const result = db.prepare('DELETE FROM medicines WHERE id = ? AND user_id = ?').run(id, userId);"
);

// AI search route? Oh, this is medicinesRouter, wait.
// Just write it out.
fs.writeFileSync(filePath, content, 'utf8');
console.log('Refactoring complete.');
