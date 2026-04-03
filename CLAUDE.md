# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run build          # Compile TypeScript → dist/
npm run dev            # Start n8n on http://localhost:5678 with hot reload
npm run lint           # Check for lint/type errors
npm run lint:fix       # Auto-fix fixable lint issues
npm run release        # Full release: build → lint → changelog → git tag → npm publish
```

All commands delegate to `n8n-node` CLI (installed as `@n8n/node-cli` dev dependency).

## Current state

This repo is a **scaffold** targeting a Postgres community node. `nodes/Example/Example.node.ts` is the starter template and has not yet been renamed/implemented. When building the real node:

1. Replace `nodes/Example/` with `nodes/Postgres/`
2. Update `package.json` → `n8n.nodes` to point at `dist/nodes/Postgres/Postgres.node.js`
3. Add credential entry to `n8n.credentials` in `package.json` if needed
4. Update `CHANGELOG.md` when bumping the package version
