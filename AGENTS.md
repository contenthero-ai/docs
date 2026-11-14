# Documentation project instructions

## About this project

- This is the ContentHero developer documentation, built on [Mintlify](https://mintlify.com), published at `docs.contenthero.ai`.
- Pages are MDX files with YAML frontmatter. Configuration lives in `docs.json`.
- The user's own AI assistant writes every word, grounded in the user's real context; ContentHero supplies that context and does the work. The docs must carry that thesis: ContentHero never generates copy server-side; agents may draft only when grounded in the user's real context and approved.
- Source material is the plugin's skill (auth ladder, per-domain workflows, cookbook; published in [`contenthero-ai/skills`](https://github.com/contenthero-ai/skills)) and the packages `@contenthero/sdk`, `@contenthero/mcp`, `@contenthero/cli`. Author from those rather than inventing.

## Terminology

- The three transports are MCP, CLI, and the raw `/api/v1`. Refer to them by the auth ladder order (MCP preferred, then CLI, then raw).
- The hosted MCP server is `https://mcp.contenthero.ai`. ContentHero tools appear as `mcp__contenthero__*`.
- The model roster is live: it is the `modelId` enum on the generate tools (MCP) or `contenthero model list` (CLI). There is no static model list to document.
- Say "brand kit" and "knowledge base", and "outliers" for top-performing inspiration content.
- **The planner vocabulary changed and this line used to be wrong.** A **space** is a board and its columns are **stages**. A **card** is one piece of work. A **post** is how a card reaches ONE platform, and a card holds one post per platform. What used to be called a post is now a card; what used to be a destination is now a post. `publish_post` survived the rename and takes a `cardId`.
- An **outlier score** measures a post against its own creator's baseline, not the platform's, which is why a small account's breakout outranks a large account's routine post.

## Where this folder lives, and generated pages

This folder is the whole documentation site, and it is a one-way mirror: it is authored in the ContentHero source repository (`apps/docs/`) and copied here on each release. A change made directly in this repository is overwritten by the next copy, so propose changes against the source repository.

`mcp/tools/*.mdx`, `cli/reference.mdx`, `skills/install.mdx` and `snippets/media-host.mdx` are generated, from the tool contract, the CLI's own command schema and the connect package of the same checkout. They carry a "GENERATED FILE" comment. Never edit the page: change the tool description, the CLI command or the connect package, then regenerate with `pnpm docs:generate` in the source repository.

`pnpm check:docs` runs in the source repository's release gate and holds three guards:

- **Generated pages current**: regenerates and diffs, so the reference cannot drift from the surface.
- **Tool and command names**: fails when hand-written prose names a tool the contract does not have, or a `contenthero` command the CLI does not have. It exists because 77 dead references sat across 10 files for about three months after the post-to-card rename, and nothing was looking. `changelog.mdx` is exempt because its entries are historical records.
- **Forbidden content**: nothing internal (a developer's home path, an internal note's name) reaches this repository.

Because the pages are generated from the same checkout that releases the packages, the docs describe exactly what that release ships.

## Style preferences

- **Never use em dashes or en dashes anywhere.** Restructure the sentence with a period, comma, parentheses, or colon. Scan every edit before saving.
- Use active voice and second person ("you").
- Keep sentences concise. One idea per sentence.
- Use sentence case for headings.
- Bold for UI elements: Click **Settings**.
- Code formatting for file names, commands, paths, and code references.
- Prefer live facts over frozen ones. Defer volatile details (model names, exact pricing) to the surfaces that resolve them live.

## Content boundaries

- Do not document internal admin features, encrypted credential columns, or anything not exposed on the public `/api/v1`, MCP, or CLI surface.
- Do not invent endpoints, parameters, or model names. If a shape is uncertain, point at `contenthero schema get` or the SDK types as the authoritative contract.
