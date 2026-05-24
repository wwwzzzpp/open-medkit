import re

with open('backend/src/routes/medicines.ts', 'r') as f:
    lines = f.read().split('\n')

for i in range(len(lines)):
    if 'const params: (string|number)[] = [userId];' in lines[i]:
        for j in range(i-5, i):
            if j >= 0 and 'const params: (string|number)[] = [userId];' in lines[j] and not lines[j].strip().startswith('//'):
                lines[i] = '// ' + lines[i]
                
    if 'getExistingMedicine(db, id, userId, userId)' in lines[i]:
        lines[i] = lines[i].replace('getExistingMedicine(db, id, userId, userId)', 'getExistingMedicine(db, id, userId)')
        
    if 'userId,' in lines[i]:
        for j in range(i+1, min(len(lines), i+4)):
            if 'userId,' in lines[j]:
                lines[j] = lines[j].replace('userId,', '')
                
    if 'medicineId: id,' in lines[i] and 'medicineName: medicine.name' in lines[i+1] and 'userId' not in lines[i-1]:
        lines[i] = 'userId,\n' + lines[i]

with open('backend/src/routes/medicines.ts', 'w') as f:
    f.write('\n'.join(lines))

with open('backend/src/routes/ai.ts', 'r') as f:
    ai = f.read()
ai = re.sub(r'medicineId: medicine\.id,\s*medicineName: medicine\.name,\s*actionType: ', r'userId: c.get("userId"),\n          medicineId: medicine.id,\n          medicineName: medicine.name,\n          actionType: ', ai)
with open('backend/src/routes/ai.ts', 'w') as f:
    f.write(ai)

