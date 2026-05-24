import re

with open('backend/src/routes/medicines.ts', 'r') as f:
    med = f.read()

# Fix duplicates of userId declaration
med = re.sub(r'const userId = c\.get\(\'userId\'\);\s*const userId = c\.get\(\'userId\'\);', r"const userId = c.get('userId');", med)
med = re.sub(r'const params: \(string\|number\)\[\] = \[userId\];\s*const params: \(string\|number\)\[\] = \[userId\];', r"const params: (string|number)[] = [userId];", med)

# Fix missing userId parameter definitions
med = med.replace('function getExistingMedicine(db: ReturnType<typeof getDb>, id: number) {', 'function getExistingMedicine(db: ReturnType<typeof getDb>, id: number, userId: number) {')

# Fix undeclared userId usages
# We can just define `const userId = c.get('userId');` at the beginning of each route handler that lacks it.
route_starts = ['medicinesRouter.get(', 'medicinesRouter.post(', 'medicinesRouter.put(', 'medicinesRouter.delete(']
lines = med.split('\n')
for i, line in enumerate(lines):
    if any(line.startswith(rs) for rs in route_starts):
        # check if next lines have userId
        has_userId = False
        for j in range(i+1, min(i+5, len(lines))):
            if 'userId = c.get' in lines[j]:
                has_userId = True
        if not has_userId:
            lines[i] = line + "\n  const userId = c.get('userId');"
med = '\n'.join(lines)

with open('backend/src/routes/medicines.ts', 'w') as f:
    f.write(med)

# Add userId to InventoryTransactionInput
with open('backend/src/services/inventory-transactions.ts', 'r') as f:
    inv = f.read()
if 'userId: number;' not in inv:
    inv = inv.replace('export interface InventoryTransactionInput {', 'export interface InventoryTransactionInput {\n  userId: number;')
    with open('backend/src/services/inventory-transactions.ts', 'w') as f:
        f.write(inv)

# Fix remaining ai errors
with open('backend/src/routes/ai.ts', 'r') as f:
    ai = f.read()
ai = ai.replace('userId: userId,', 'userId: c.get("userId"),')
with open('backend/src/routes/ai.ts', 'w') as f:
    f.write(ai)

