# ContentHero Developer Docs

The source for [docs.contenthero.ai](https://docs.contenthero.ai), built with [Mintlify](https://mintlify.com).

## Structure

- `docs.json` is the site config (navigation, theme, branding).
- Pages are MDX, organized by the navigation groups: Get Started, Authentication, Account, Guides, Tools, Recipes, and API Reference.
- Logo and favicon assets live under `logo/` and `favicon.svg`.

## Local preview

```bash
npm i -g mint
mint dev
```

Open the local URL Mintlify prints. Edits hot-reload.

## Publishing

Pushes to the default branch deploy automatically through the connected Mintlify project.

## Source material

Content is authored from the live developer surface and the agent skills:

- Skills repo: [`contenthero-ai/skills`](https://github.com/contenthero-ai/skills) (auth ladder, per-domain workflows, cookbook)
- Packages: `@contenthero/sdk`, `@contenthero/mcp`, `@contenthero/cli`
- The hosted MCP server: `https://mcp.contenthero.ai`

Writing rule: no em dashes or en dashes anywhere. Restructure the sentence instead.
