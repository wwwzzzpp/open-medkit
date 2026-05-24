import re

with open('backend/src/routes/medicines.ts', 'r') as f:
    med = f.read()

# Fix duplicates of userId declaration and params
med = re.sub(r'const userId = c\.get\(\'userId\'\);\s*\n\s*const userId = c\.get\(\'userId\'\);', r"const userId = c.get('userId');", med)
med = re.sub(r'const params: \(string\|number\)\[\] = \[userId\];\s*\n\s*const params: \(string\|number\)\[\] = \[userId\];', r"const params: (string|number)[] = [userId];", med)
med = re.sub(r'getExistingMedicine\(db, id, userId, userId\)', 'getExistingMedicine(db, id, userId)', med)

# Add userId to InventoryTransactionInput in medicines.ts
med = med.replace('medicineId: id,\n          medicineName: medicine.name,\n          actionType: ', 'userId,\n          medicineId: id,\n          medicineName: medicine.name,\n          actionType: ')
med = med.replace('medicineId: id,\n          medicineName: normalized.name,\n          actionType: ', 'userId,\n          medicineId: id,\n          medicineName: normalized.name,\n          actionType: ')
med = med.replace('medicineId: row.id,\n          medicineName: row.name,\n          actionType: ', 'userId,\n          medicineId: row.id,\n          medicineName: row.name,\n          actionType: ')

# Also the one with `medicineId: id, medicineName: medicine.name,` without newlines
med = re.sub(r'medicineId: id,\s*medicineName: medicine\.name,\s*actionType:', r'userId,\n          medicineId: id,\n          medicineName: medicine.name,\n          actionType:', med)
med = re.sub(r'medicineId: row\.id,\s*medicineName: row\.name,\s*actionType:', r'userId,\n          medicineId: row.id,\n          medicineName: row.name,\n          actionType:', med)

with open('backend/src/routes/medicines.ts', 'w') as f:
    f.write(med)

# Fix AI
with open('backend/src/routes/ai.ts', 'r') as f:
    ai = f.read()

ai = re.sub(r'medicineId: intent\.medicine\.id,\s*medicineName: medicine\.name,\s*actionType:', r'userId: c.get("userId"),\n            medicineId: intent.medicine.id,\n            medicineName: medicine.name,\n            actionType:', ai)
with open('backend/src/routes/ai.ts', 'w') as f:
    f.write(ai)

