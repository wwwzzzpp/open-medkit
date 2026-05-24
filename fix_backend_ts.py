import re
import os

def fix_medicines():
    path = 'backend/src/routes/medicines.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Fix duplicate userIds
    content = re.sub(r'userId:\s*c\.get\("userId"\),\s*userId:\s*c\.get\("userId"\),', 'userId: c.get("userId"),', content)
    content = re.sub(r'userId:\s*c\.get\("userId"\) as number,\s*userId:\s*c\.get\("userId"\) as number,', 'userId: c.get("userId"),', content)
    
    # Replace references to plain 'userId' with 'c.get("userId")' inside route handlers
    # e.g., userId: userId -> userId: c.get("userId")
    # Actually wait, let's just do `const userId = c.get('userId');` at the top of each route function?
    # No, it's easier to just find the exact errors. Let's see the compiler output.
    
    # We will declare `const userId = c.get('userId');` in every route.
    # We find all `app.get(`, `app.post(`, `app.put(`, `app.delete(`
    # and insert `const userId = c.get('userId');` at the beginning of the block.
    # First, revert the messy `c.get("userId")` back to `userId` everywhere except in `app.*` definition.
    pass

def replace_in_file(filename, old, new):
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            c = f.read()
        c = c.replace(old, new)
        with open(filename, 'w') as f:
            f.write(c)

def fix_all():
    # Fix src/ai/medicine.ts
    replace_in_file('backend/src/ai/medicine.ts', 'const { timezone } = getStoredTimezone(db);', 'const { timezone } = getStoredTimezone(db, 1);') # Assume admin user for MCP/AI tests or we need to pass userId. For MCP, we can use user 1.
    
    # Fix src/mcp-server.ts
    replace_in_file('backend/src/mcp-server.ts', 'const { timezone } = getStoredTimezone(db);', 'const { timezone } = getStoredTimezone(db, 1);')
    replace_in_file('backend/src/mcp-server.ts', 'const { timezone } = getStoredTimezone(this.db);', 'const { timezone } = getStoredTimezone(this.db, 1);')
    
    # Fix settings.ts
    replace_in_file('backend/src/routes/settings.ts', 'setStoredTimezone(db, body.timezone)', 'setStoredTimezone(db, body.timezone, c.get("userId"))')
    
    # Fix timezone.test.ts
    replace_in_file('backend/src/utils/timezone.test.ts', 'setStoredTimezone(db, \'Mars/Base\')', 'setStoredTimezone(db, \'Mars/Base\', 1)')
    replace_in_file('backend/src/utils/timezone.test.ts', 'setStoredTimezone(db, 1, \'Mars/Base\')', 'setStoredTimezone(db, \'Mars/Base\', 1)')

    # Re-run tsc to see what remains
    
fix_all()
