# Documentation project instructions

## About this project

- This is the ContentHero developer documentation, built on [Mintlify](https://mintlify.com), published at `docs.contenthero.ai`.
- Pages are MDX files with YAML frontmatter. Configuration lives in `docs.json`.
- ContentHero is the context and execution layer for AI content creation. The user's own LLM is the brain. The docs must carry that thesis: ContentHero never generates copy server-side; agents may draft only when grounded in the user's real context and approved.
- Source material lives in the skills repo [`contenthero-ai/skills`](https://github.com/contenthero-ai/skills) (auth ladder, per-domain workflows, cookbook) and the packages `@contenthero/sdk`, `@contenthero/mcp`, `@contenthero/cli`. Author from those rather than inventing.

## Terminology

- The three transports are MCP, CLI, and the raw `/api/v1`. Refer to them by the auth ladder order (MCP preferred, then CLI, then raw).
- The hosted MCP server is `https://mcp.contenthero.ai`. ContentHero tools appear as `mcp__contenthero__*`.
- The model roster is live: it is the `modelId` enum on the generate tools (MCP) or `contenthero model list` (CLI). There is no static model list to document.
- Say "brand kit" and "knowledge base", "outliers" for top-performing inspiration content, "post" for a pipeline post.

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
- Do not invent endpoints, parameters, or model names. If a shape is uncertain, point at `contenthero schema` or the SDK types as the authoritative contract.
