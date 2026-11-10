# Publishing this repository

Push from the `traceboard` directory. Its sibling `supportlens` project and any
parent-directory archive are separate projects, not part of this repository.

## Before the first push

```sh
npm ci
npm run check
npm run format:check
npm run build
npm run repo:check -- --history
git diff --check
git status --short
```

Check the staged diff before committing. `.gitignore` excludes dependencies,
builds, local Cloudflare state, environment files, private-key formats, archives,
logs, local databases, editor files, and browser reports. The lockfile, source,
tests, screenshot assets, and two empty environment templates remain publishable.
The ignore behavior is tested against Git itself.

The repository check also flags already tracked ignored files. Adding a pattern
to `.gitignore` does not remove a file from the index or older commits. If a real
credential was committed, revoke it first and clean the affected history.

## Create and push

Create an **empty public repository** named `traceboard` on your GitHub account.
Leave its README, license, and ignore-file options unchecked because these files
already exist here. If the working tree is clean and the release is already
committed, skip the first two commands. From this directory:

```sh
git add .
git commit -m "Polish Traceboard for public release"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/traceboard.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your account. If `origin` already exists, inspect
`git remote -v` before changing it. Do not overwrite a remote you still need.
GitHub may ask you to authenticate; never place a token in the remote URL.

Suggested description:

> Evidence-first debugging briefs with BM25 retrieval, validated source citations, optional Groq inference, and a no-key demo.

Suggested topics: `typescript`, `react`, `generative-ai`, `rag`, `debugging`,
`groq`, `cloudflare-workers`, `portfolio`.

## A two-minute portfolio demo

1. Run the checkout timeout sample and inspect the cited log/code lines.
2. Explain why checking the quote is different from proving the root cause.
3. Show the connection-leak verification steps and Markdown export.
4. Open a test that rejects a fabricated citation and run `npm test`.
5. Explain the optional provider boundary and how live requests handle quotas.

Samples are authored fixtures. If you show a live analysis, label it and use your
own key. Describe the tradeoffs and failures you understand rather than claiming
an unmeasured diagnosis-accuracy score.
