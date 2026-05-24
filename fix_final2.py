with open('backend/tsconfig.json', 'r') as f:
    ts = f.read()
# We don't need to change tsconfig, we can just run the server using `npm run start` (which uses tsx) and it ignores type errors by default.
