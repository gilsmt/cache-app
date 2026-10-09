# Contributing to Cache App

Thank you for your interest in contributing to the Cache App. We welcome contributions in all forms—from bug fixes and documentation to new features. This repository favors incremental change over perfection.

## How to Contribute

1. **Fork the Repository** — Click the **Fork** button on GitHub.

2. **Clone Your Fork**

    ```bash
    git clone https://github.com/<your-username>/cache-app.git
    cd cache-app
    ```

3. **Create a Branch** — Use at most three words, separated by hyphens, with no slashes or type prefixes.

    ```bash
    git checkout -b session-recovery
    ```

    Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

4. **Make Your Changes** — Solve the problem at its source. Read the full implementation of what you change and its direct callers before you edit it.

5. **Commit Your Changes** — Use a short, imperative subject line. The existing history follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) with an optional scope, such as `fix(automations): re-check entitlement before claiming a run`.

6. **Push Your Branch**

    ```bash
    git push origin session-recovery
    ```

7. **Create a Pull Request** — Open a PR against the `main` branch.

## Reporting Issues

If you find a bug or have a feature request, open an issue on GitHub. Please include:

- A clear, descriptive title.
- Steps to reproduce (for bugs).
- Expected vs. actual behaviour.
- Screenshots or logs if relevant.
- Environment details (browser, OS, etc.).

For security vulnerabilities, do not open a public issue. Follow [SECURITY.md](SECURITY.md) instead.

## Pull Request Process

1. **Keep your branch up to date** — Rebase onto the latest `main` before submitting.
2. **Pass the local gate** — A pre-commit hook runs on every commit:

    ```bash
    bun lint          # Ultracite (Biome)
    bun type-check    # TypeScript
    ```

    Run `bun test` too, and add a test with your change: new features need coverage, and bug fixes need a regression test.

3. **Include tests** — Tests live next to the code they cover, as `*.test.ts`, and run with Bun's test runner.
4. **Document changes** — Update the relevant documentation if your PR changes behaviour or adds features.
5. **Reference issues** — Link to any related issues in the PR description.
6. **Write a short description** — At most two sentences covering why the change is needed, what used to happen, and what it now does. Reviewers rely on it; do not restate the diff.
7. **Review process** — Maintainers will review your PR and may request changes.

## Local Development Setup

### Prerequisites

- [Bun](https://bun.sh/) 1.4.x (see `packageManager` in `package.json`)
- [Node.js](https://nodejs.org/) 24.x (see `engines` and `.nvmrc`)
- PostgreSQL 12+ (local or remote)

### Setup

```bash
git clone https://github.com/gilsmt/cache-app.git
cd cache-app
bun install

cp .env.example .env
# Edit .env with your DATABASE_URL and API keys

bun run db-deploy
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful Commands

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `bun run dev`        | Start the dev server                |
| `bun run build`      | Production build                    |
| `bun run start`      | Serve the production build          |
| `bun lint`           | Run the Ultracite (Biome) linter    |
| `bun lint:fix`       | Auto-fix lint issues                |
| `bun type-check`     | TypeScript type check               |
| `bun test`           | Run the test suite                  |
| `bun run db-migrate` | Create and apply a Prisma migration |
| `bun run db-deploy`  | Apply pending migrations            |
| `bun run translate`  | Sync translations with gt-next      |

## License

By contributing to Cache App, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
