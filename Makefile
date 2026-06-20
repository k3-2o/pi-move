.PHONY: fmt fmt-check lint typecheck check security smoke install clean

# --- Formatting ---

fmt:
	@echo "=== Formatting with Prettier ==="
	npx prettier --write '{index.ts,src/*.ts}'

fmt-check:
	@echo "=== Checking format with Prettier ==="
	npx prettier --check '{index.ts,src/*.ts}'

# --- Linting ---

lint:
	@echo "=== Linting with ESLint ==="
	npx eslint 'index.ts' 'src/*.ts'

# --- Type Checking ---

typecheck:
	@echo "=== Type checking with tsc ==="
	npx tsc --noEmit

# --- Combined Check ---

check: fmt-check lint typecheck
	@echo "=== All checks passed ==="

# --- Security Audit ---

security:
	@echo "=== Security audit ==="
	npm audit --audit-level=high

# --- Smoke Test ---

smoke:
	@echo "=== Smoke test ==="
	bun -e "import('./src/index.ts').then(() => console.log('SMOKE OK')).catch(e => { console.error(e); process.exit(1); })"

# --- Install ---

install:
	@echo "=== Installing dependencies ==="
	npm install

# --- Clean ---

clean:
	@echo "=== Cleaning ==="
	rm -rf node_modules/ dist/
	rm -f package-lock.json
