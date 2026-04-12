# Job Hunter

Job Hunter is a job-search assistant for individual job seekers.

The product aggregates jobs from official/public sources, normalizes and deduplicates them, scores them for a specific user, explains fit, and helps the user stay organized through the application process.

## Product intent

This is not a spray-and-pray auto-apply bot.

The product is designed to help a user:
- discover strong opportunities faster
- reduce time spent reviewing low-fit jobs
- understand why a job is worth applying to
- track what they have seen, saved, hidden, or applied to
- prepare tailored materials without fully automating the user out of the process

## Current repository status

This repository is currently scaffolded as a TypeScript monorepo with a minimal runnable baseline:

```text
apps/
  api/      # Node API skeleton with health endpoint
  web/      # Placeholder web homepage server
  worker/   # Background worker entrypoint stub
packages/
  shared/   # Shared types/constants
docs/
```

## Suggested local commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

## Documentation index

- `AGENTS.md` - shared instructions for AI coding agents
- `docs/mvp-scope.md` - what MVP includes and excludes
- `docs/architecture.md` - target architecture and module boundaries
- `docs/domain-model.md` - core data model and business rules
- `docs/testing.md` - testing strategy and quality gates
- `.github/copilot-instructions.md` - repo-wide Copilot guidance
- `.github/instructions/*.instructions.md` - scoped instructions by area
- `.github/prompts/*.prompt.md` - reusable prompts for repeated workflows

## Build order

Recommended order for early implementation:
1. repository skeleton
2. auth and user profile/preferences
3. resume upload and parsing
4. connector framework and first job sources
5. canonical jobs and dedupe
6. search and discovery UI
7. explainable scoring
8. tracker and reminders
9. application support tooling
