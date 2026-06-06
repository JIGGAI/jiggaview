# JIGGAVIEW

**Web dashboard plugin for the [JIGGA](https://github.com/JIGGAI/JIGGA) runtime.**

JIGGAVIEW is a local-first Next.js dashboard over your `~/.jigga` runtime:
agents, recipes, tasks, runs, and settings — rendered from the same audited,
policy-gated CLI a human uses.

## Architecture: CLI-as-API

JIGGA core has **no HTTP API** by design — the supervisor is a loop, the
interfaces are files and the `jigga` CLI. JIGGAVIEW's server components and
API routes shell out to `jigga … --json` for every read and mutation
(`src/lib/jigga-cli.ts` is the entire integration boundary):

```
Browser ←→ Next.js (localhost) ←→ jigga CLI ←→ ~/.jigga files ←→ supervisor (executes)
```

The UI can queue work; only the supervisor executes it. Every change lands in
the audit log like any CLI edit.

## Run (development)

Prerequisites: Node 18+, and the `jigga` CLI on PATH (or `JIGGA_BIN=/path/to/jigga`).

```bash
npm install
npm run dev          # http://localhost:3000
```

## Plugin model

JIGGAVIEW is the reference **JIGGA plugin**: an out-of-process app declared by
a capability manifest (`type: app`), installed/approved/supervised by JIGGA
itself (`jigga plugins install jiggaview` — service unit, doctor visibility).
Plugins bring their own runtimes; JIGGA core stays stdlib+PyYAML.

## Status

M1 (operate set) in progress:
- ✅ Dashboard (doctor + task counts)
- ✅ Recipes (list / installed state / drift / scaffold)
- ✅ Tasks (live queue)
- ✅ Settings (config get/set)
- ✅ Agents (cards: team/model/tools/cron badges, team-filtered)
- ✅ Runs (live audit log)

M2: webchat (channel adapter) · tickets (lanes, JIGGA #110). M3: teams/workspaces · memory browser · approvals.

Forked from [ClawKitchen](https://github.com/JIGGAI/clawkitchen) (the OpenClaw
dashboard by the same author); rebuilt for JIGGA's CLI-as-API architecture.

## License

Apache-2.0
