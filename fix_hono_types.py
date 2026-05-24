import os
import glob

files = glob.glob('backend/src/routes/*.ts')

for file in files:
    with open(file, 'r') as f:
        content = f.read()
    
    # We add the type definition
    content = content.replace('new Hono()', 'new Hono<{ Variables: { userId: number } }>()')
    
    with open(file, 'w') as f:
        f.write(content)

