const fs = require('fs');

const files = [
  'backend/src/routes/medicines.ts',
  'backend/src/routes/ai.ts',
  'backend/src/routes/settings.ts',
  'backend/src/routes/notifications.ts',
  'backend/src/routes/auth.ts'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/new Hono\(\)/g, 'new Hono<{ Variables: { userId: number } }>()');
    // Also clean up bad replacements
    content = content.replace(/c\.get\("userId"\) as number/g, 'c.get("userId")');
    content = content.replace(/c\.get\('userId'\) as number/g, "c.get('userId')");
    content = content.replace(/userId: c\.get\("userId"\),\n\s*userId: c\.get\("userId"\),/g, 'userId: c.get("userId"),');
    fs.writeFileSync(file, content);
  }
}

let inv = fs.readFileSync('backend/src/services/inventory-transactions.ts', 'utf8');
inv = inv.replace(/userId: number;\n  userId: number;/g, 'userId: number;');
fs.writeFileSync('backend/src/services/inventory-transactions.ts', inv);

let tzTest = fs.readFileSync('backend/src/utils/timezone.test.ts', 'utf8');
tzTest = tzTest.replace(/setStoredTimezone\(db, 1, 'Mars\/Base'\)/, "setStoredTimezone(db, 'Mars/Base', 1)");
fs.writeFileSync('backend/src/utils/timezone.test.ts', tzTest);
