---
name: workzoon-wiki
description: "Maintain the Agent Workzoon LLM wiki. Triggers: ingest, query wiki, lint wiki, worktree map, what do I know about this repo, Karpathy wiki."
---

# Agent Workzoon wiki

This repo uses [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern, scoped to a multi-agent coding suite.

## Layers

- `.lattice/raw/` — immutable sources. Read only after write.
- `.lattice/wiki/` — compiled pages. Write `concepts/` `sources/` `syntheses/` only via `workzoon wiki-write` when POLICY allows that bucket.
- `.lattice/wiki/entities/` — engine-compiled live git map. Do not hand-edit.
- Schema — this file plus the managed `AGENTS.md` block.

## Operations

**Ingest.** Copy a source into `.lattice/raw/<topic>/YYYY-MM-DD-slug.md` (engine records sha256 in `raw/.manifest.json`). Preserve original text. Then compile into wiki pages, update `wiki/index.md`, append `wiki/log.md` with `## [YYYY-MM-DD] ingest | Title`.

Handoffs are copied by the engine to `.lattice/raw/handoffs/<taskId>/<ts>.md`. Compile them with `workzoon wiki-write --bucket sources` when `agentWrites.sources` is on.

**Query.** Read `wiki/index.md` first, then entity pages, then concepts. Cite pages. File good answers into `wiki/syntheses/` only when asked.

**Lint.** Check index coverage, broken `[[wikilinks]]`, orphan pages, and raw files that were never compiled. Auto-fix index rows. Never rewrite `raw/`.

## Policy

Read `.lattice/POLICY.md`. Default actor is agent (fail closed). Humans pass `--actor human` or `X-Workzoon-Actor: human`. Destructive actions never auto-allow.

## Duties

Wiki maintenance is a duty, not a switch. After ingest or handoff, compile allowed buckets with `workzoon wiki-write`, update index, append log, then `workzoon lint --fix 1`. Closed buckets lint as `write-forbidden`. Mark done only after the wiki gate passes.

## Never

Do not add remotes, force-push, delete artifacts, edit raw after write, hand-edit `wiki/entities/`, or edit policy. Do not delete the base branch or a live worktree HEAD.

## Holdings

The human owns four things. Read `.lattice/HOLDINGS.md` first:

1. Repo and remotes
2. Branches
3. Source worktrees
4. Artifacts (`out/`, `dist/`, …)

Do not add remotes, delete branches, or publish artifacts unless asked.

## Worktree rule

One feature = one branch = one worktree. Live map is `wiki/entities/holdings.md`. Copy the path from that page or from the Agent Workzoon forest. Do not invent checkout locations.
