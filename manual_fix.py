import re
import os

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

# src/routes/medicines.ts fixes
med = read_file('backend/src/routes/medicines.ts')
med = med.replace('userId: userId,', 'userId: c.get("userId"),')
med = re.sub(r'c\.get\("userId"\) as number,\n\s*userId:\s*c\.get\("userId"\) as number,', 'userId: c.get("userId"),', med)
med = re.sub(r'userId:\s*c\.get\("userId"\),\n\s*userId:\s*c\.get\("userId"\),', 'userId: c.get("userId"),', med)
write_file('backend/src/routes/medicines.ts', med)

# Check how getStoredTimezone is defined
tz = read_file('backend/src/utils/timezone.ts')
if 'export function getStoredTimezone(db: SqliteDatabase, userId: number)' in tz:
    # We must provide userId everywhere
    mcp = read_file('backend/src/mcp-server.ts')
    mcp = mcp.replace('getStoredTimezone(db)', 'getStoredTimezone(db, 1)')
    mcp = mcp.replace('getStoredTimezone(this.db)', 'getStoredTimezone(this.db, 1)')
    write_file('backend/src/mcp-server.ts', mcp)
    
    ai_med = read_file('backend/src/ai/medicine.ts')
    ai_med = ai_med.replace('getStoredTimezone(db)', 'getStoredTimezone(db, 1)')
    write_file('backend/src/ai/medicine.ts', ai_med)
    
    # We should change settings.ts to provide userId
    settings = read_file('backend/src/routes/settings.ts')
    settings = settings.replace('setStoredTimezone(db, body.timezone)', 'setStoredTimezone(db, body.timezone, c.get("userId"))')
    write_file('backend/src/routes/settings.ts', settings)

# We have `Cannot redeclare block-scoped variable 'userId'` in medicines.ts
# I need to remove `const userId = c.get('userId');` if it's duplicated.
med = read_file('backend/src/routes/medicines.ts')
lines = med.split('\n')
for i, line in enumerate(lines):
    if 'const userId = c.get("userId");' in line and lines[:i].count(line) > 0:
        pass # Wait, that's not right. It's block-scoped, so if there are multiple in the same block.

