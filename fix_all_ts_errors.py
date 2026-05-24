import re

def fix_medicines():
    with open('backend/src/routes/medicines.ts', 'r') as f:
        lines = f.read().split('\n')
    
    # Fix duplicate variable declarations and missing userIds
    for i in range(len(lines)):
        if 'const userId = c.get(\'userId\');' in lines[i]:
            # if we see another one nearby, comment it out
            for j in range(i-5, i):
                if j >= 0 and 'const userId = c.get(\'userId\');' in lines[j]:
                    lines[i] = '// ' + lines[i]
        if 'const params: (string|number)[] = [userId];' in lines[i]:
            for j in range(i-5, i):
                if j >= 0 and 'const params: (string|number)[] = [userId];' in lines[j]:
                    lines[i] = '// ' + lines[i]
        
        if 'medicineId: id,' in lines[i] and 'medicineName: medicine.name,' in lines[i+1]:
            lines[i] = 'userId,\n          ' + lines[i]
        
        if 'medicineId: row.id,' in lines[i] and 'medicineName: row.name,' in lines[i+1]:
            lines[i] = 'userId,\n          ' + lines[i]
            
        if 'medicineId: normalized.name,' in lines[i] or 'medicineId: id,' in lines[i] and 'medicineName: normalized.name' in lines[i+1]:
            lines[i] = 'userId,\n          ' + lines[i]

        if 'getExistingMedicine(db, id, userId, userId)' in lines[i]:
            lines[i] = lines[i].replace('getExistingMedicine(db, id, userId, userId)', 'getExistingMedicine(db, id, userId)')
        
        # fix: src/routes/medicines.ts(521,9): error TS1117: An object literal cannot have multiple properties with the same name.
        if 'userId,' in lines[i] and 'userId,' in lines[i+1]:
            lines[i] = '// ' + lines[i]

    with open('backend/src/routes/medicines.ts', 'w') as f:
        f.write('\n'.join(lines))
        
def fix_ai():
    with open('backend/src/routes/ai.ts', 'r') as f:
        ai = f.read()
    ai = re.sub(r'medicineId: medicine\.id,\s*medicineName: medicine\.name,\s*actionType:', r'userId: c.get("userId"),\n            medicineId: medicine.id,\n            medicineName: medicine.name,\n            actionType:', ai)
    # line 689 argument of type string | undefined
    ai = ai.replace('const apiKey = req.header("X-AI-Api-Key") || settings.ai_api_key;', 'const apiKey = req.header("X-AI-Api-Key") || settings.ai_api_key || "";')
    with open('backend/src/routes/ai.ts', 'w') as f:
        f.write(ai)

def fix_ai_medicine():
    with open('backend/src/ai/medicine.ts', 'r') as f:
        ai = f.read()
    ai = ai.replace('category: match[6]?.trim(),', 'category: match[6]?.trim() as any,')
    ai = ai.replace('category: match[5]?.trim(),', 'category: match[5]?.trim() as any,')
    with open('backend/src/ai/medicine.ts', 'w') as f:
        f.write(ai)

def fix_query_test():
    with open('backend/src/ai/query.test.ts', 'r') as f:
        ai = f.read()
    ai = ai.replace('result.data.answer', 'result.data!.answer')
    ai = ai.replace('result.data.medicines', 'result.data!.medicines')
    ai = ai.replace('result.data.inventoryChanged', 'result.data!.inventoryChanged')
    with open('backend/src/ai/query.test.ts', 'w') as f:
        f.write(ai)

fix_medicines()
fix_ai()
fix_ai_medicine()
fix_query_test()
