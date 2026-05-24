import re

# 1. Fix inventory-transactions.ts
with open('backend/src/services/inventory-transactions.ts', 'r') as f:
    inv = f.read()

# Fix recordInventoryTransaction
inv = inv.replace('INSERT INTO inventory_transactions\n      (medicine_id, medicine_name, action_type', 'INSERT INTO inventory_transactions\n      (user_id, medicine_id, medicine_name, action_type')
inv = inv.replace('VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')

# Add input.userId to run()
inv = inv.replace('.run(\n    input.medicineId || null', '.run(\n    input.userId,\n    input.medicineId || null')

# Fix listInventoryTransactions
inv = inv.replace('export function listInventoryTransactions(\n  db: SqliteDatabase,\n  medicineId: number,\n  limit = 30,\n) {', 'export function listInventoryTransactions(\n  db: SqliteDatabase,\n  userId: number,\n  medicineId: number,\n  limit = 30,\n) {')

inv = inv.replace('WHERE medicine_id = ?', 'WHERE user_id = ? AND medicine_id = ?')
inv = inv.replace('.all(medicineId, normalizedLimit)', '.all(userId, medicineId, normalizedLimit)')

with open('backend/src/services/inventory-transactions.ts', 'w') as f:
    f.write(inv)


# 2. Fix medicinesRouter.post('/')
with open('backend/src/routes/medicines.ts', 'r') as f:
    med = f.read()

# Find medicinesRouter.post('/')
med = med.replace('INSERT INTO medicines\n          (name, brand, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)\n          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'INSERT INTO medicines\n          (user_id, name, brand, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)\n          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')

med = med.replace('.run(\n        payload.name,', '.run(\n        userId,\n        payload.name,')

# Find missing userId in recordInventoryTransaction
# Replace instances where userId is missing
# (we already put userId, in my previous python script, but let's just make sure)
# Let's do a regex replacement for any recordInventoryTransaction(db, { that doesn't have userId immediately following

med = re.sub(r'recordInventoryTransaction\(db, \{\n\s*medicineId:', r'recordInventoryTransaction(db, {\n      userId,\n      medicineId:', med)

with open('backend/src/routes/medicines.ts', 'w') as f:
    f.write(med)

