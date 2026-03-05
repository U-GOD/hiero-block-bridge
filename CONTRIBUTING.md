# Contributing to HieroBlockBridge

Thank you for your interest in contributing! This guide covers everything you need to get started.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [DCO Sign-Off](#dco-sign-off)
- [GPG Signing](#gpg-signing)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)

---

## Development Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/hiero-block-bridge.git
cd hiero-block-bridge

# 2. Install dependencies
npm install

# 3. Run the full check suite
npm run lint          # ESLint
npm run typecheck     # TypeScript compiler
npm run build         # tsup build
npm test              # Vitest (all 306 tests)
npm run test:coverage # Tests + coverage report
```

### Prerequisites

| Tool | Version | Required |
|---|---|---|
| Node.js | ≥ 20 LTS | Yes |
| npm | ≥ 10 | Yes |
| Docker | Latest | Only for Automator module |
| Git | ≥ 2.34 | Yes (for sign-off / GPG) |

---

## Branch Naming

Use the following prefixes for your branches:

| Prefix | Use Case | Example |
|---|---|---|
| `feat/` | New feature | `feat/block-range-query` |
| `fix/` | Bug fix | `fix/health-check-timeout` |
| `docs/` | Documentation | `docs/update-api-reference` |
| `test/` | Adding or updating tests | `test/throttle-monitor-edge-cases` |
| `ci/` | CI/CD changes | `ci/add-node-22-matrix` |
| `refactor/` | Code refactoring | `refactor/extract-fetch-helper` |
| `chore/` | Maintenance / dependencies | `chore/bump-vitest` |

```bash
git checkout -b feat/my-awesome-feature
```

---

## Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
Signed-off-by: Your Name <your.email@example.com>
```

### Types

| Type | Description |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `test` | Adding missing tests or correcting existing tests |
| `ci` | Changes to CI configuration files and scripts |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf` | A code change that improves performance |
| `chore` | Other changes that don't modify src or test files |

### Examples

```bash
# Feature
git commit -s -m "feat(simulator): add block range pagination support"

# Bug fix with scope
git commit -s -m "fix(health): handle ECONNRESET on health check timeout"

# Breaking change
git commit -s -m "feat(types)!: rename BlockStreamEvent to BlockEvent

BREAKING CHANGE: BlockStreamEvent has been renamed to BlockEvent.
Update all imports accordingly."
```

---

## DCO Sign-Off

All commits **must** include a `Signed-off-by` line, certifying that you have the right to submit the code under the project's open-source license ([Developer Certificate of Origin](https://developercertificate.org/)).

### How to sign off

Use the `-s` (or `--signoff`) flag when committing:

```bash
git commit -s -m "feat: add new feature"
```

This appends the following to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

### Configure your identity

Make sure your Git name and email are set correctly:

```bash
git config --global user.name "Your Full Name"
git config --global user.email "your.email@example.com"
```

> [!IMPORTANT]
> Commits without a valid `Signed-off-by` line will not be accepted.

---

## GPG Signing

We recommend (but do not require) GPG-signing your commits for verified authorship.

### Quick setup

```bash
# 1. Generate a GPG key (if you don't have one)
gpg --full-generate-key

# 2. List your keys and copy the key ID
gpg --list-secret-keys --keyid-format=long
# Look for: sec rsa4096/ABCDEF1234567890

# 3. Configure Git to use your key
git config --global user.signingkey ABCDEF1234567890
git config --global commit.gpgsign true

# 4. Add your public key to GitHub
gpg --armor --export ABCDEF1234567890
# Paste the output at: https://github.com/settings/keys
```

For detailed instructions, see [GitHub's GPG signing guide](https://docs.github.com/en/authentication/managing-commit-signature-verification).

---

## Pull Request Process

### Before opening a PR

- [ ] Code compiles: `npm run typecheck`
- [ ] Linter passes: `npm run lint`
- [ ] All tests pass: `npm test`
- [ ] Coverage thresholds met: `npm run test:coverage`
- [ ] All commits are signed off (`-s` flag)

### PR guidelines

1. **One concern per PR** — keep PRs focused. A feature PR should not also refactor unrelated code.
2. **Link related issues** — reference issues with `Fixes #123` or `Closes #456` in the PR description.
3. **Describe your changes** — explain *what* changed and *why*. Screenshots or recordings for UI changes.
4. **Keep it small** — PRs under 400 lines are reviewed faster. Split large changes into stacked PRs.

### Review process

1. Open a PR against `main`
2. CI must pass (lint, typecheck, build, tests, coverage)
3. At least **1 approving review** is required
4. Reviewer may request changes — address feedback and re-request review
5. Once approved and CI is green, the PR will be squash-merged

### PR title format

Use the same Conventional Commits format:

```
feat(simulator): add configurable heartbeat interval
fix(migration): handle regex edge case in HIERO-030 detection
docs: update Quick Start examples in README
```

---

## Code Style

Code style is enforced automatically — you don't need to memorize rules.

### Automated tools

| Tool | Config | Purpose |
|---|---|---|
| **ESLint** | `eslint.config.js` | Linting and code quality |
| **Prettier** | `.prettierrc` | Code formatting |
| **TypeScript** | `tsconfig.json` | Type checking |
| **Husky + lint-staged** | `package.json` | Pre-commit hooks |

### Key conventions

- **TypeScript strict mode** — no `any` without justification
- **Explicit return types** on public API functions
- **`const` by default** — use `let` only when reassignment is needed
- **No `var`** — enforced by ESLint
- **Strict equality** — always use `===` / `!==`
- **Error handling** — use `HieroBridgeError` with appropriate `ErrorCode`
- **Result type** — return `Result<T, E>` for operations that can fail, not thrown exceptions

### Format on save

```bash
# Format all source files
npm run format

# Check formatting without modifying
npm run format:check
```

---

## Testing

### Running tests

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npx vitest run <file>       # Run a specific test file
```

### Writing tests

- Place unit tests in `tests/unit/<module>/` mirroring the `src/` structure
- Place integration tests in `tests/integration/`
- Use descriptive test names: `it('returns unhealthy when endpoint is unreachable')`
- Mock external dependencies (`fetch`, `execa`, `fs`) — don't make real network calls in unit tests
- Use the shared `silentLogger` from `tests/setup.ts` to suppress log noise

### Coverage thresholds

| Metric | Threshold |
|---|---|
| Statements | 75% |
| Branches | 60% |
| Functions | 75% |
| Lines | 75% |

---

## Questions?

Open an [issue](https://github.com/U-GOD/hiero-block-bridge/issues) or start a [discussion](https://github.com/U-GOD/hiero-block-bridge/discussions). We're happy to help!
