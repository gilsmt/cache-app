# Contributing to Cache

Thank you for your interest in contributing to the Cache App. We welcome contributions in all forms—from bug fixes and documentation to new features. This repository favors incremental change over perfection.

## How to Contribute

1. **Fork the Repository** — Click the **Fork** button on GitHub.

2. **Clone Your Fork**

    ```bash
    git clone https://github.com/<your-username>/cache.git
    cd cache
    ```

3. **Create a Feature Branch**

    ```bash
    git checkout -b feat/your-feature-name
    ```

    Use clear naming conventions: `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`.

4. **Make Your Changes** — Keep changes small, focused, and consistent with existing code style.

5. **Commit Your Changes** — Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (see [guidelines](#commit-message-guidelines) below).

6. **Push Your Branch**

    ```bash
    git push origin feat/your-feature-name
    ```

7. **Create a Pull Request** — Open a PR against the `main` branch. Provide a clear description and reference any related issues (e.g., `fixes #123`).

---

## Reporting Issues

If you find a bug or have a feature request, open an issue on GitHub. Please include:

- A clear, descriptive title.
- Steps to reproduce (for bugs).
- Expected vs. actual behaviour.
- Screenshots or logs if relevant.
- Environment details (browser, OS, etc.).

---

## Pull Request Process

1. **Keep your branch up to date** — Rebase onto the latest `main` before submitting.
2. **Run quality checks** — Your code must pass all CI checks:

    ```bash
    bun run type-check
    bun run lint
    bun run test
    ```

3. **Include tests** — New features should include tests. Bug fixes should include a regression test.
4. **Document changes** — Update relevant documentation if your PR changes behaviour or adds features.
5. **Reference issues** — Link to any related issues in the PR description.
6. **Review process** — Maintainers will review your PR and may request changes. We aim to respond within a few business days.

---

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <description>
```

**Types:**

| Type       | Usage                                   |
| ---------- | --------------------------------------- |
| `feat`     | A new feature                           |
| `fix`      | A bug fix                               |
| `docs`     | Documentation changes                   |
| `style`    | Code style (formatting, etc.)           |
| `refactor` | Code change that neither fixes nor adds |
| `test`     | Adding or updating tests                |
| `chore`    | Build process, tooling, dependencies    |
| `perf`     | Performance improvement                 |

**Examples:**

```
feat(collections): add AI-assisted relevance ranking
fix(search): resolve plain English query parsing for non-English text
docs: update installation instructions
chore(deps): upgrade Prisma to v7
```

---

## Local Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.3.14+
- [Node.js](https://nodejs.org/) 24.x
- PostgreSQL 12+

### Setup

```bash
git clone https://github.com/rortan134/cache-app.git
cd cache-app
bun install

cp .env.example .env
# Edit .env with your DATABASE_URL and API keys

bun run db-deploy
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful Commands

| Command              | Description           |
| -------------------- | --------------------- |
| `bun run dev`        | Start dev server      |
| `bun run build`      | Production build      |
| `bun run lint`       | Run Ultracite linter  |
| `bun run lint:fix`   | Auto-fix lint issues  |
| `bun run test`       | Run unit test suite   |
| `bun run type-check` | TypeScript type check |

---

## License

By contributing to Cache, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
