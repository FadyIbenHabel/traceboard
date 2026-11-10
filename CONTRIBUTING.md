# Contributing

Use Node.js 22 LTS (`nvm use`) and npm. The lockfile is part of the project.

```sh
npm ci
npm run dev
```

Before opening a pull request:

```sh
npm run format:check
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run format` applies formatting. Tests and browser checks use the authored
sample cases and mocked provider responses; they do not require a model key.

Keep changes focused. Add a regression test when fixing retrieval, validation,
transport, or history behavior. Explain any change to the model prompt or limits.
Never make live provider requests part of the default test suite.

Real logs and keys belong outside Git. Use synthetic incident fixtures and the
empty `.env.example` / `.dev.vars.example` templates. Run
`npm run repo:check -- --history` before publishing a new repository.

The repository check recognizes common credential formats; it cannot detect
every possible secret. Review the staged diff as well. See [SECURITY.md](SECURITY.md).
