# AI Central Integration

This repository keeps project-specific AI policy in version control and links reusable steering and
skills from the sibling `ai-central` checkout for local Codex work.

## Installed Selection

- Profiles: `base`, `javascript-typescript`
- Skill bundles: `core`, `planning`, `workflow`
- Mode: `link`

Repo-owned files such as `AGENTS.md` and the project steering files remain real files. Reusable
content under `.codex/skills/` and the generic JavaScript/TypeScript steering file are local symlinks
and are intentionally ignored.

## Refresh

With `ai-central` checked out beside this repository:

```sh
pnpm codex:links
```

If it lives elsewhere, point the wrapper at its repository root:

```sh
AI_CENTRAL_HOME=/path/to/ai-central pnpm codex:links
```

The reviewed AI Central revision for this initial integration is recorded in
`.codex/ai-central-pin.json`. The pin records provenance; refreshes do not modify repo-owned policy
or automatically approve future AI Central changes.
