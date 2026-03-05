# Contributing to DMWork Web

Thank you for your interest in contributing! Please read through these guidelines before submitting issues or pull requests.

## Issue Workflow

### Claiming an Issue

**Before starting any work on an issue, you MUST:**

1. **Comment on the issue** to claim it — state that you are taking it on
2. **Describe your proposed fix or implementation plan** in the same comment
3. **Wait for acknowledgement** from a maintainer or team member before proceeding

This prevents duplicate work and ensures alignment on the approach. If an issue already has someone assigned or a claim comment, coordinate with them first.

### Reporting Bugs

- Use the [Bug Report](https://github.com/Mininglamp-OSS/octo-web/issues/new?template=bug_report.yml) template
- Include steps to reproduce, expected vs actual behavior, and environment info
- Attach screenshots or logs when possible

### Requesting Features

- Use the [Feature Request](https://github.com/Mininglamp-OSS/octo-web/issues/new?template=feature_request.yml) template
- Describe the problem/motivation and your proposed solution
- **Features require discussion before implementation** — do not submit a PR without prior agreement

## Pull Request Workflow

### Fork & Branch

1. **Fork** the repository to your own GitHub account
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/dmwork-web.git
   cd dmwork-web
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/Mininglamp-OSS/octo-web.git
   ```
4. **Create a branch from the latest upstream main**:
   ```bash
   git fetch upstream
   git checkout -b fix/issue-<number>-<short-description> upstream/main
   ```
5. **Push to your fork** and open a PR against `Mininglamp-OSS/octo-web:main`

### Branch Naming

```
fix/issue-<number>-<short-description>
feat/issue-<number>-<short-description>
docs/<short-description>
chore/<short-description>
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
fix: correct reminder filter logic (#20)
feat: add dark mode toggle
docs: add CONTRIBUTING.md
chore: update dependencies
```

### PR Requirements

- **One PR per issue** — do not mix unrelated changes
- **Reference the issue** in the PR description (e.g., `Fixes #20`)
- **Fill out the PR template** completely
- **Ensure CI passes** before requesting review
- **Keep PRs small and focused** — easier to review, faster to merge

### Code Review

- All PRs require at least one review before merging
- Address review comments promptly
- Use inline review comments tied to specific code lines

### AI-Assisted Contributions

If AI tools were used in creating the PR:
- Note it in the PR description
- Indicate the level of testing (untested / lightly tested / fully tested)
- Confirm you understand the code changes

## Development Setup

### Prerequisites

- Node.js >= 18
- Yarn 1.22+

### Getting Started

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/<your-username>/dmwork-web.git
cd dmwork-web
git remote add upstream https://github.com/Mininglamp-OSS/octo-web.git

# Install dependencies
yarn install

# Start development server
yarn dev
```

### Project Structure

```
apps/web/              — Main application (Web + Electron + Tauri)
packages/
  dmworkbase/          — Core components and utilities
  dmworklogin/         — Login/registration module
  dmworkcontacts/      — Contacts module
  dmworkdatasource/    — Data source module
```

## Code Style

- TypeScript strict mode
- Use specific types — avoid `any`
- Follow existing patterns in the codebase
- Use Semi UI components for new UI elements

## Questions?

Open a [Discussion](https://github.com/Mininglamp-OSS/octo-web/discussions) for general questions.
