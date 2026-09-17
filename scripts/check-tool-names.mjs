/**
 * Fails when hand-written prose names an MCP tool or a CLI command that does not exist.
 *
 * This is the guard for the failure that motivated the whole reference generator.
 * Measured 2026-09-17: 20 dead tool names sat across 7 files for roughly three months,
 * survivors of the rename from the `post` vocabulary to `card`. `create_post`,
 * `list_posts`, `get_post`, `add_post_destination` and friends were all still being
 * taught to readers. Nothing caught it because nothing was looking.
 *
 * The generated pages under mcp/tools/ and cli/reference.mdx cannot go stale, because
 * `npm run check:reference` regenerates and diffs them. This covers the OTHER half: the
 * guides, the cookbook, the host pages and the quickstart, which are written by hand and
 * always will be.
 *
 * What it reads:
 *   - the live MCP tool list, from the published @contenthero/mcp
 *   - the live CLI command tree, from the published @contenthero/cli
 *
 * What it does NOT do: check that prose describes a tool CORRECTLY. It only checks that
 * the thing named exists. A guard that catches every misuse would need to understand the
 * prose; this one catches the whole class of failure that actually happened.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '@contenthero/mcp/dist/server.js'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = dirname(import.meta.dirname)

/**
 * Generated pages are excluded: they are produced FROM the live surface, so checking them
 * against it proves nothing, and `check:reference` already guards them.
 */
const GENERATED = ['mcp/tools', 'cli/reference.mdx']

/**
 * Names that look like tools but are deliberately written about as gone, or belong to
 * another vocabulary. Keep this list short and justify every entry, or it becomes the
 * place dead names go to hide.
 */
const ALLOWED = new Set([
  // An API key prefix, not an operation.
  'ch_live_',
])

function mdxFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'scripts') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...mdxFiles(full))
    else if (entry.endsWith('.mdx')) out.push(full)
  }
  return out
}

/* ------------------------------------------------------------- the live surface */

const server = await buildServer({ getClient: () => ({}) })
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
const mcp = new Client({ name: 'tool-name-check', version: '0' })
await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)])
const { tools } = await mcp.listTools()
const liveTools = new Set(tools.map((t) => t.name))

// Read the CLI schema through a FILE, not a pipe: `contenthero schema` calls
// process.exit() while stdout still holds buffered data, and Node's stdout is async for
// pipes, so a piped read truncates at 64KB. Measured on cli 0.3.4.
const schemaPath = join(tmpdir(), `ch-cli-names-${process.pid}.json`)
execFileSync('sh', [
  '-c',
  `node ${JSON.stringify(join(REPO, 'node_modules/@contenthero/cli/dist/index.js'))} schema > ${JSON.stringify(schemaPath)}`,
])
const cliSchema = JSON.parse(readFileSync(schemaPath, 'utf8'))
rmSync(schemaPath, { force: true })
const liveCommands = new Set(cliSchema.commands.map((c) => c.command))

/* ------------------------------------------------------------------- the search */

/**
 * Any snake_case identifier written in backticks is a candidate tool name.
 *
 * The first version of this anchored on a VERB LIST derived from the live tools, and
 * that was structurally blind in exactly the wrong direction: a dead tool whose verb is
 * no longer used by anything cannot match a list built from surviving verbs. It missed
 * `schedule_post` (4 files) and `wait_for_generation` (4 files, including the quickstart
 * and for-ai-agents, the two pages that matter most). A guard only covers the shape it
 * was written for, and that shape excluded the likeliest failures.
 *
 * Measured on the same corpus: the backtick rule finds 51 distinct tokens, 21 of them
 * genuinely dead tools and 3 not tools at all. Two of those three end in `_id`, which is
 * a field, so the only judgement call left is the ALLOWED list above.
 */
const TOOL_RE = /`([a-z][a-z0-9]*_[a-z0-9_]+)`/g
/**
 * Only match `contenthero` where it is being INVOKED, which means at the start of a line
 * (optionally after a shell prompt or `npx`) or immediately after a backtick.
 *
 * Anchoring matters. A looser `\bcontenthero\s+(\w+)` flagged two lines that were both
 * correct: `claude mcp add --transport http contenthero https://mcp.contenthero.ai`,
 * where `contenthero` is the server NAME being registered, and
 * `> use the contenthero mcp to get my balance`, which is prose addressed to an agent.
 * A guard that flags correct text gets switched off, so it has to be precise about what
 * a command invocation looks like.
 */
// Horizontal whitespace only. `\s+` matches newlines, so a command at the end of one
// line swallowed the first words of the next and produced phrases that exist nowhere:
// `contenthero avatar list` (real) was reported dead because the capture ran on into the
// following line.
const CLI_RE = /(?:^|`|\$ |npx )contenthero[ \t]+([a-z][a-z0-9-]*(?:[ \t]+[a-z][a-z0-9-]*){0,2})\b/gm

const problems = []

for (const file of mdxFiles(REPO)) {
  const rel = relative(REPO, file)
  if (GENERATED.some((g) => rel === g || rel.startsWith(g + '/'))) continue

  const text = readFileSync(file, 'utf8')

  for (const match of text.matchAll(TOOL_RE)) {
    const name = match[1]
    if (liveTools.has(name) || ALLOWED.has(name)) continue
    // A trailing _id is a field on a payload, not an operation.
    if (name.endsWith('_id')) continue
    const line = text.slice(0, match.index).split('\n').length
    problems.push(`${rel}:${line}  tool \`${name}\` does not exist`)
  }

  for (const match of text.matchAll(CLI_RE)) {
    const phrase = match[1].trim()

    // A phrase is fine when it IS a leaf command, or is a PREFIX of one. That covers
    // prose naming a group ("the contenthero avatar commands"), three-level commands
    // like `avatar look add`, and a leaf quoted with its flags stripped, while still
    // rejecting a verb that no longer exists.
    //
    // Two earlier versions got this wrong in opposite directions. Accepting any phrase
    // whose FIRST WORD headed something let `contenthero generation wait` pass, because
    // `generation status` exists. Then requiring two-word phrases to be exact leaves
    // wrongly flagged `contenthero avatar look`, which is a real group. Prefix matching
    // is the rule that satisfies both.
    const ok =
      phrase.startsWith('-') ||
      [...liveCommands].some((c) => c === phrase || c.startsWith(phrase + ' '))
    if (ok) continue
    const line = text.slice(0, match.index).split('\n').length
    problems.push(`${rel}:${line}  command \`contenthero ${phrase}\` does not exist`)
  }
}

if (problems.length) {
  console.error(`Documentation names ${problems.length} thing(s) that do not exist:\n`)
  for (const p of problems) console.error('  ' + p)
  console.error('\nEither the name changed, or the page is describing a surface we removed.')
  process.exit(1)
}

console.log(
  `Every tool and command named in hand-written pages exists (${liveTools.size} tools, ${liveCommands.size} commands).`,
)
process.exit(0)
