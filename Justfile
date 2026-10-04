BIN := "node_modules/.bin"

check: typecheck test lint format-check

typecheck:
	{{BIN}}/tsc -p tsconfig.json

test:
	bun test

coverage:
	bun test --coverage

lint:
	{{BIN}}/oxlint

format:
	{{BIN}}/oxfmt index.ts src test bench

format-check:
	{{BIN}}/oxfmt --check index.ts src test bench

publint:
	{{BIN}}/publint

bench:
	bun bench/keystroke.ts

smoke:
	bun -e "import('./index.ts').then(() => console.log('[smoke] ok')).catch((e) => { console.error(e); process.exit(1); })"

security:
	npm audit --audit-level=high

clean:
	rm -rf node_modules dist
