---
name: git-commit
description: >
  Create git commits with Conventional Commits messages and safety checks.
  Use when the user asks to commit, write a commit message, stage changes,
  or review what will be committed. Do not use for push, PR creation, or
  rebases unless the user explicitly asks.
---

## Gate

- **Only commit when the user explicitly asks** (e.g. "commit", "create a commit").
- If unclear, ask first. Do not commit opportunistically after finishing work.
- **Never** update `git config`, skip hooks (`--no-verify`), or amend unless the amend rules below apply.
- **Never push** unless the user explicitly asks (separate from commit).
- Do not commit likely secrets (`.env`, credentials, keys). Warn if the user asked to include them.

## Pre-commit workflow

Run these **in parallel** before staging or committing:

```bash
git status
git diff
git log -5 --oneline
```

Use the output to:

1. Confirm there are changes worth committing (no empty commit).
2. Draft a message that matches recent repo style.
3. Exclude secret/credential files from the commit.

## Message format

Lowercase [Conventional Commits](https://www.conventionalcommits.org/) type, optional scope, imperative summary naming the main module or behavior:

```
type: summary
type(scope): summary
```

| Type | Use for |
|------|---------|
| `feat` | New behavior |
| `fix` | Bug fix |
| `refactor` | Behavior-preserving restructure |
| `docs` | Documentation only |
| `test` | Tests only |
| `chore` | Tooling, deps, CI, non-product code |

**Summary:** concise, imperative, specific — not `update files` or `fix stuff`.

**Body (multi-area or multi-file changes):** blank line, then `-` bullets for distinct changes.

### Examples

```
docs: extract persistent-state protocol into skill and remove from AGENTS.md
```

```
feat(api): validate resource exists before submission
```

```
feat(http): add head method to api client
```

Multi-change example:

```
refactor(checkout): split payment validation from cart store

- move card validation into PaymentValidator
- keep CartStore focused on line items only
```

## Commit steps

Run **sequentially**:

1. Stage only relevant paths (`git add` — not blanket `git add .` unless the user wants everything).
2. Commit with the drafted message.
3. `git status` to confirm success.

### Message on the command line

**bash / sh** — HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
feat(scope): imperative summary

- distinct change one
- distinct change two
EOF
)"
```

**PowerShell** — here-string:

```powershell
git commit -m @"
feat(scope): imperative summary

- distinct change one
- distinct change two
"@
```

Or multiple `-m` flags (title + body):

```bash
git commit -m "feat(scope): imperative summary" -m "- distinct change one" -m "- distinct change two"
```

## Amend (rare)

Use `git commit --amend` **only** when **all** are true:

1. User explicitly requested amend, **or** the last commit succeeded but a hook auto-modified files that must be included.
2. `git log -1` shows the last commit was created in this conversation (or user confirms it).
3. Branch is **not** pushed, or user explicitly accepts amend after push.

If the commit **failed** or a hook **rejected** it, fix the issue and create a **new** commit — never amend.

## After commit

Report: commit hash (short), summary of what was included, and whether anything remains unstaged.

Do not push unless the user explicitly asks.
