const fs = require('fs');
const path = require('path');

function replaceInFile(filename, replacements) {
  const filePath = path.join(__dirname, 'backend/src', filename);
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Refactored ${filename}`);
}

replaceInFile('utils/timezone.ts', [
  [/export function getStoredTimezone\(db: SqliteDatabase\)/g, 'export function getStoredTimezone(db: SqliteDatabase, userId: number)'],
  [/SELECT value FROM app_settings WHERE key = 'timezone'/g, "SELECT value FROM app_settings WHERE key = 'timezone' AND user_id = ?"],
  [/\.get\(\) as/g, '.get(userId) as'],
  [/export function setStoredTimezone\(db: SqliteDatabase, timezone: string\)/g, 'export function setStoredTimezone(db: SqliteDatabase, timezone: string, userId: number)'],
  [/INSERT INTO app_settings \(key, value\)/g, "INSERT INTO app_settings (user_id, key, value)"],
  [/VALUES \('timezone', \?\)/g, "VALUES (?, 'timezone', ?)"],
  [/ON CONFLICT\(key\)/g, "ON CONFLICT(user_id, key)"],
  [/\.run\(timezone\)/g, ".run(userId, timezone)"]
]);

replaceInFile('routes/settings.ts', [
  [/getStoredTimezone\(db\)/g, 'getStoredTimezone(db, c.get("userId"))'],
  [/setStoredTimezone\(db, timezone\)/g, 'setStoredTimezone(db, timezone, c.get("userId"))'],
  [/UPDATE notification_channels SET last_notified_date = NULL/g, "UPDATE notification_channels SET last_notified_date = NULL WHERE user_id = ?"],
  [/\.run\(\)/g, '.run(c.get("userId"))'],
]);

replaceInFile('routes/notifications.ts', [
  [/SELECT \* FROM notification_channels ORDER BY channel_type ASC'/g, "SELECT * FROM notification_channels WHERE user_id = ? ORDER BY channel_type ASC'"],
  [/\.all\(\)/g, '.all(c.get("userId"))'],
  [/SELECT \* FROM notification_channels WHERE channel_type = \?'\)\n\s*\.get\(channelType\)/g, "SELECT * FROM notification_channels WHERE channel_type = ? AND user_id = ?')\n      .get(channelType, c.get(\"userId\"))"],
  [/DELETE FROM notification_channels WHERE channel_type = \?'\)\n\s*\.run\(channelType\)/g, "DELETE FROM notification_channels WHERE channel_type = ? AND user_id = ?')\n      .run(channelType, c.get(\"userId\"))"],
  [/SELECT channel_type FROM notification_channels WHERE channel_type = \?'\)\n\s*\.get\(channelType\)/g, "SELECT channel_type FROM notification_channels WHERE channel_type = ? AND user_id = ?')\n      .get(channelType, c.get(\"userId\"))"],
  [/INSERT INTO notification_channels \(channel_type, config\)\n\s*VALUES \(\?, \?\)/g, "INSERT INTO notification_channels (user_id, channel_type, config)\n        VALUES (?, ?, ?)"],
  [/\.run\(\n\s*channelType,\n\s*JSON\.stringify\(payload\)\n\s*\)/g, ".run(\n        c.get(\"userId\"),\n        channelType,\n        JSON.stringify(payload)\n      )"],
  [/UPDATE notification_channels\n\s*SET config = \?, updated_at = datetime\('now'\)\n\s*WHERE channel_type = \?/g, "UPDATE notification_channels\n        SET config = ?, updated_at = datetime('now')\n        WHERE channel_type = ? AND user_id = ?"],
  [/\.run\(\n\s*JSON\.stringify\(payload\),\n\s*channelType\n\s*\)/g, ".run(\n        JSON.stringify(payload),\n        channelType,\n        c.get(\"userId\")\n      )"],
  [/INSERT INTO notification_channels \(channel_type, enabled\)\n\s*VALUES \(\?, \?\)/g, "INSERT INTO notification_channels (user_id, channel_type, enabled)\n        VALUES (?, ?, ?)"],
  [/\.run\(channelType, enabled \? 1 : 0\)/g, ".run(c.get(\"userId\"), channelType, enabled ? 1 : 0)"],
  [/UPDATE notification_channels\n\s*SET enabled = \?, updated_at = datetime\('now'\)\n\s*WHERE channel_type = \?/g, "UPDATE notification_channels\n        SET enabled = ?, updated_at = datetime('now')\n        WHERE channel_type = ? AND user_id = ?"],
  [/\.run\(\n\s*enabled \? 1 : 0,\n\s*channelType\n\s*\)/g, ".run(\n        enabled ? 1 : 0,\n        channelType,\n        c.get(\"userId\")\n      )"],
  [/INSERT INTO notification_channels \(channel_type, notify_hour\)\n\s*VALUES \(\?, \?\)/g, "INSERT INTO notification_channels (user_id, channel_type, notify_hour)\n        VALUES (?, ?, ?)"],
  [/\.run\(channelType, notifyHour\)/g, ".run(c.get(\"userId\"), channelType, notifyHour)"],
  [/UPDATE notification_channels\n\s*SET notify_hour = \?, updated_at = datetime\('now'\)\n\s*WHERE channel_type = \?/g, "UPDATE notification_channels\n        SET notify_hour = ?, updated_at = datetime('now')\n        WHERE channel_type = ? AND user_id = ?"],
  [/\.run\(\n\s*notifyHour,\n\s*channelType\n\s*\)/g, ".run(\n        notifyHour,\n        channelType,\n        c.get(\"userId\")\n      )"],
  [/SELECT config FROM notification_channels WHERE channel_type = \?'\)\n\s*\.get\(channelType\)/g, "SELECT config FROM notification_channels WHERE channel_type = ? AND user_id = ?')\n      .get(channelType, c.get(\"userId\"))"],
]);

replaceInFile('routes/ai.ts', [
  [/getStoredTimezone\(db\)/g, 'getStoredTimezone(db, c.get("userId"))'],
  [/\.all\(\)/g, '.all(c.get("userId"))'],
  [/SELECT \*\n\s*FROM medicines\n\s*ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC/g, "SELECT *\n        FROM medicines\n        WHERE user_id = ?\n        ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC"],
  [/UPDATE medicines SET quantity = \? WHERE id = \?/g, "UPDATE medicines SET quantity = ? WHERE id = ? AND user_id = ?"],
  [/\.run\(nextQuantity, intent\.medicine\.id\)/g, ".run(nextQuantity, intent.medicine.id, c.get(\"userId\"))"],
  [/UPDATE inventory_batches SET quantity = \? WHERE id = \?/g, "UPDATE inventory_batches SET quantity = ? WHERE id = ? AND user_id = ?"],
  [/\.run\(\n\s*nextQuantity,\n\s*intent\.batch\.id\n\s*\)/g, ".run(\n        nextQuantity,\n        intent.batch.id,\n        c.get(\"userId\")\n      )"],
  [/SELECT \* FROM medicines WHERE id = \?'\)\n\s*\.get\(intent\.medicine\.id\)/g, "SELECT * FROM medicines WHERE id = ? AND user_id = ?')\n        .get(intent.medicine.id, c.get(\"userId\"))"],
  [/medicineId: intent\.medicine\.id,/g, "userId: c.get(\"userId\"),\n            medicineId: intent.medicine.id,"]
]);

console.log('All other refactorings complete.');
