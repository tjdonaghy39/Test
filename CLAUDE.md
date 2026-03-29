# CLAUDE.md

This file provides guidance for AI assistants (such as Claude Code) working in this repository.

## Repository Overview

**Name:** Test
**Owner:** tjdonaghy39
**Remote:** `tjdonaghy39/Test` on GitHub
**Status:** Freshly initialized — no source code yet beyond a placeholder README.

This is a minimal repository currently containing only a README. It was created with a single "Initial commit" and has no language, framework, or tooling established yet.

## Repository Structure

```
Test/
└── README.md   # Placeholder README (contents: "# Test\nTest")
```

## Git Workflow

### Branches

- `main` — the stable/default branch. Do not push directly unless explicitly told to.
- `claude/<description>` — branches used for AI-assisted work. Always develop on the designated feature branch.

### Branch to develop on

When working in an AI-assisted session, always check the system instructions for the designated branch. Currently: `claude/add-claude-documentation-ka0jd`.

### Commit conventions

- Use clear, descriptive commit messages in the imperative mood (e.g., `Add authentication module`, `Fix null pointer in parser`).
- Keep commits focused — one logical change per commit.
- Do not amend published commits; create new ones instead.

### Push workflow

```bash
git push -u origin <branch-name>
```

If a push fails due to a network error, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s).

### Pull requests

Do **not** create a pull request unless the user explicitly requests one.

## Development Conventions (to be established)

Because this repository has no source code yet, the following conventions should be adopted when adding code:

### General principles

- Prefer editing existing files over creating new ones.
- Do not add speculative abstractions or features not explicitly requested.
- Do not add comments to code unless the logic is non-obvious.
- Avoid backward-compatibility shims for code that has no users yet.

### Security

- Never introduce command injection, XSS, SQL injection, or other OWASP Top 10 vulnerabilities.
- Validate input only at system boundaries (user input, external APIs).

### Testing

- Add tests when a testing framework is established for the project.
- Do not add test stubs or empty test files speculatively.

## When to Ask vs. Act

**Act freely (local, reversible):**
- Creating or editing files
- Running tests or linters
- Staging and committing changes on the designated branch

**Ask first (irreversible or shared-state):**
- Force-pushing or resetting commits
- Deleting files or branches
- Creating pull requests
- Pushing to `main`
- Any action visible to others (comments, PR reviews, releases)

## Notes for AI Assistants

- This repo currently has no build system, test runner, linter, or CI/CD. Do not assume any of these exist until they are added.
- When the stack is decided (language, framework, tooling), update this file to reflect the new conventions.
- Keep this file up to date as the project evolves — it is the single source of truth for AI working conventions in this repo.
