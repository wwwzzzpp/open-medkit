const fs = require('fs');

function fix() {
  let content = fs.readFileSync('backend/src/routes/medicines.ts', 'utf8');
  content = content.replace(/c\.get\("userId"\)/g, 'c.get("userId") as number');
  content = content.replace(/userId: c\.get\("userId"\) as number,/g, 'userId: c.get("userId") as number,');
  content = content.replace(/export async function getInventoryBatches\(medicineId: number\) \{/g, 'export async function getInventoryBatches(medicineId: number, userId: number) {');
  
  // Replace missing userId in InventoryTransactionInput
  content = content.replace(/medicineId: \S+, \/\/\S+\n\s*medicineName: \S+,\n\s*actionType: /g, 'userId: c.get("userId") as number,\n        $&');
  content = content.replace(/medicineId: [^,]+,\n\s*medicineName: [^,]+,\n\s*actionType: /g, 'userId: c.get("userId") as number,\n        $&');
  content = content.replace(/medicineId: row.id,\n\s*medicineName: row.name,\n\s*actionType: /g, 'userId: c.get("userId") as number,\n        $&');
  
  fs.writeFileSync('backend/src/routes/medicines.ts', content);

  let notif = fs.readFileSync('backend/src/routes/notifications.ts', 'utf8');
  notif = notif.replace(/c\.get\("userId"\)/g, 'c.get("userId") as number');
  fs.writeFileSync('backend/src/routes/notifications.ts', notif);

  let settings = fs.readFileSync('backend/src/routes/settings.ts', 'utf8');
  settings = settings.replace(/c\.get\("userId"\)/g, 'c.get("userId") as number');
  settings = settings.replace(/setStoredTimezone\(db, body\.timezone\)/g, 'setStoredTimezone(db, body.timezone, c.get("userId") as number)');
  fs.writeFileSync('backend/src/routes/settings.ts', settings);

  let ai = fs.readFileSync('backend/src/routes/ai.ts', 'utf8');
  ai = ai.replace(/c\.get\("userId"\)/g, 'c.get("userId") as number');
  fs.writeFileSync('backend/src/routes/ai.ts', ai);

  let inv = fs.readFileSync('backend/src/services/inventory-transactions.ts', 'utf8');
  inv = inv.replace(/export interface InventoryTransactionInput \{/, 'export interface InventoryTransactionInput {\n  userId: number;');
  fs.writeFileSync('backend/src/services/inventory-transactions.ts', inv);
  
  let notifier = fs.readFileSync('backend/src/services/notifier.ts', 'utf8');
  notifier = notifier.replace(/getStoredTimezone\(db\)/g, 'getStoredTimezone(db, 1)'); // Hardcode to admin for notifier cron, or fetch user
  fs.writeFileSync('backend/src/services/notifier.ts', notifier);
  
  let tzTest = fs.readFileSync('backend/src/utils/timezone.test.ts', 'utf8');
  tzTest = tzTest.replace(/getStoredTimezone\(db\)/g, 'getStoredTimezone(db, 1)');
  tzTest = tzTest.replace(/setStoredTimezone\(db, /g, 'setStoredTimezone(db, 1, ');
  tzTest = tzTest.replace(/INSERT INTO app_settings \(key, value\)/g, 'INSERT INTO app_settings (user_id, key, value)');
  tzTest = tzTest.replace(/VALUES \('timezone', /g, "VALUES (1, 'timezone', ");
  fs.writeFileSync('backend/src/utils/timezone.test.ts', tzTest);
}

fix();
