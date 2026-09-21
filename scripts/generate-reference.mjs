/**
 * Generates the MCP tool reference and the CLI command reference as Mintlify MDX,
 * by asking the PUBLISHED packages what they expose.
 *
 * Why runtime and not source: a generator that parses TypeScript can disagree with
 * what the server actually advertises. This connects a real MCP client to a real
 * server over an in-memory transport and calls listTools(), and it shells the CLI's
 * own `schema` command. Neither can drift from the thing it documents.
 *
 * Why the published packages and not the working tree: the docs describe what a
 * reader can install today. Documenting a capability nobody can reach is worse than
 * documenting it late.
 *
 * Output is deterministic: stable ordering, no timestamps, no version stamps inside
 * the prose. That is what lets CI regenerate and diff to catch drift.
 */

import { createRequire } from 'node:module'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
/**
 * ⚠️ IMPORTED FROM THE PACKAGE ENTRYPOINT, NOT FROM `dist/server.js` AND `dist/groups.js`.
 * Those deep paths existed in `@contenthero/mcp@0.4.6` and do NOT exist in `0.4.13`, which bundles
 * to a single `dist/index.js`. Reaching past a package's public entrypoint into its build layout
 * makes every internal reorganization a breaking change for this script, and it broke exactly that
 * way the first time these pins were brought current. `buildServer`, `TOOL_GROUPS` and
 * `assertGroupsCoverTools` are all exported from the entrypoint, which is the supported surface.
 */
import { buildServer, TOOL_GROUPS, assertGroupsCoverTools } from '@contenthero/mcp'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * `--check` regenerates into a throwaway directory and diffs against what is
 * committed, exiting non-zero on any difference. That is the ratchet: the
 * reference cannot drift from the packages without CI going red.
 */
const CHECK = process.argv.includes('--check')

/**
 * ⚠️ THE VERSIONS THIS GENERATED FROM, PRINTED ON EVERY RUN.
 *
 * 🚨 `--check` REGENERATES FROM THE SAME INSTALL IT THEN DIFFS AGAINST, so it is green by
 * construction and CANNOT detect staleness. On 2026-09-21 it reported "Reference is current" while
 * the docs described `@contenthero/mcp@0.4.6` and the published package was `0.4.13` -- seven
 * patches of tool descriptions, including a renamed render mode, missing from the docs with a
 * passing check. The check proves the docs match node_modules; it says nothing about whether
 * node_modules matches the product.
 *
 * Printing the version is the cheap half of the fix: "Reference is current (from mcp@0.4.6)" reads
 * very differently from "Reference is current". The other half is a release step -- bump these pins
 * when the packages publish, then regenerate.
 */
function generatedFrom() {
  const v = (name) => {
    try {
      return createRequire(import.meta.url)(`${name}/package.json`).version
    } catch {
      return 'unresolved'
    }
  }
  return `mcp@${v('@contenthero/mcp')}, cli@${v('@contenthero/cli')}`
}

const REPO = dirname(import.meta.dirname)
const OUT = CHECK ? join(tmpdir(), `ch-reference-check-${process.pid}`) : REPO

/* ------------------------------------------------------------------ grouping */

/**
 * Which reference page each tool lands on.
 *
 * This list USED TO LIVE HERE. It now comes from the published @contenthero/mcp, which is
 * the package that defines the tools, because three artifacts needed the same grouping:
 * these docs, the ContentHero agent skill, and the MCP package's own tool-list test. Three
 * hand-maintained copies of 88 names is three chances to disagree and nothing that notices.
 *
 * Grouping is still EDITORIAL (deriving it from tool names would reshuffle the docs on
 * every rename), it just has one home now, and that home is next to the definitions. Its
 * completeness is proven by a test inside that package, before publish, and re-checked
 * here against the surface this generator actually read.
 */

/* -------------------------------------------------------------------- render */

/** Mintlify renders MDX, so a stray brace or angle bracket in prose becomes JSX. */
function mdxSafe(s) {
  return String(s).replace(/([{}<>])/g, '\\$1')
}

/** A JSON Schema type rendered the way a reader thinks about it. */
function typeOf(prop) {
  if (Array.isArray(prop.enum)) return prop.enum.map((v) => `\`${v}\``).join(' \\| ')
  if (prop.type === 'array') {
    const inner = prop.items?.type ?? 'value'
    return `${inner}[]`
  }
  if (Array.isArray(prop.anyOf)) {
    return prop.anyOf.map((a) => a.type ?? 'object').filter(Boolean).join(' or ')
  }
  return prop.type ?? 'object'
}

function renderTool(tool) {
  const schema = tool.inputSchema ?? {}
  const props = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  const write = tool.annotations?.readOnlyHint === false

  const lines = []
  lines.push(`### \`${tool.name}\``)
  lines.push('')
  lines.push(`<Badge>${write ? 'write' : 'read'}</Badge>`)
  lines.push('')
  lines.push(mdxSafe(tool.description ?? ''))
  lines.push('')

  const names = Object.keys(props)
  if (names.length === 0) {
    lines.push('Takes no parameters.')
    lines.push('')
    return lines.join('\n')
  }

  // Required first, then optional, each alphabetical. Stable across runs.
  const ordered = [
    ...names.filter((n) => required.has(n)).sort(),
    ...names.filter((n) => !required.has(n)).sort(),
  ]

  for (const name of ordered) {
    const p = props[name]
    const attrs = [`name="${name}"`, `type="${typeOf(p)}"`]
    if (required.has(name)) attrs.push('required')
    lines.push(`<ParamField body ${attrs.join(' ')}>`)
    lines.push(mdxSafe(p.description ?? ''))
    lines.push('</ParamField>')
    lines.push('')
  }
  return lines.join('\n')
}

function renderToolPage(group, tools) {
  const front = [
    '---',
    `title: "${group.title}"`,
    `description: "${group.blurb}"`,
    '---',
    '',
    '{/* GENERATED FILE. Do not edit by hand. */}',
    '{/* Regenerate with `npm run generate:reference` in contenthero-docs. */}',
    '',
    `${group.blurb} ${tools.length} tool${tools.length === 1 ? '' : 's'}.`,
    '',
    'Every tool below is exposed by the hosted MCP server at `https://mcp.contenthero.ai` and by the `@contenthero/mcp` npm package. A <Badge>write</Badge> tool changes your account; a <Badge>read</Badge> tool does not.',
    '',
    '',
  ].join('\n')
  return front + tools.map(renderTool).join('\n') + '\n'
}

function renderCliPage(commands, globals) {
  const byNoun = new Map()
  for (const c of commands) {
    const noun = c.command.split(' ')[0]
    if (!byNoun.has(noun)) byNoun.set(noun, [])
    byNoun.get(noun).push(c)
  }

  const out = [
    '---',
    'title: "Command reference"',
    'description: "Every ContentHero CLI command, its arguments and its options."',
    '---',
    '',
    '{/* GENERATED FILE. Do not edit by hand. */}',
    '{/* Regenerate with `npm run generate:reference` in contenthero-docs. */}',
    '',
    `Every command the CLI exposes, grouped by resource. ${commands.length} commands.`,
    '',
    'Run `contenthero schema` to get this same information as JSON, which is the discovery path for agents.',
    '',
    '## Global options',
    '',
    'These apply to every command.',
    '',
    '| Flag | Purpose |',
    '| --- | --- |',
    ...globals.map((o) => `| \`${o.flags}\` | ${mdxSafe(o.description ?? '')} |`),
    '',
  ]

  for (const noun of [...byNoun.keys()].sort()) {
    out.push(`## \`${noun}\``)
    out.push('')
    for (const c of byNoun.get(noun).sort((a, b) => a.command.localeCompare(b.command))) {
      const args = c.arguments
        .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`) + (a.variadic ? '...' : ''))
        .join(' ')
      out.push(`### \`contenthero ${c.command}${args ? ' ' + args : ''}\``)
      out.push('')
      out.push(mdxSafe(c.description ?? ''))
      out.push('')
      if (c.arguments.length) {
        out.push('| Argument | Required | Purpose |')
        out.push('| --- | --- | --- |')
        for (const a of c.arguments) {
          out.push(`| \`${a.name}\` | ${a.required ? 'yes' : 'no'} | ${mdxSafe(a.description ?? '')} |`)
        }
        out.push('')
      }
      if (c.options.length) {
        out.push('| Option | Purpose |')
        out.push('| --- | --- |')
        for (const o of c.options) {
          const def = o.default === undefined ? '' : ` Defaults to \`${JSON.stringify(o.default)}\`.`
          out.push(`| \`${o.flags}\` | ${mdxSafe(o.description ?? '')}${def} |`)
        }
        out.push('')
      }
    }
  }
  return out.join('\n') + '\n'
}

/* ---------------------------------------------------------------------- main */

const server = await buildServer({ getClient: () => ({}) })
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
const mcp = new Client({ name: 'reference-generator', version: '0' })
await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)])
const { tools } = await mcp.listTools()

const byName = new Map(tools.map((t) => [t.name, t]))

// GUARD: every tool belongs to exactly one group, and no group names a tool that no
// longer exists. The check ships WITH the grouping now, so the docs and the skill cannot
// drift apart by each fixing it differently.
try {
  assertGroupsCoverTools(tools.map((t) => t.name))
} catch (err) {
  console.error(String(err.message))
  console.error('\nThe grouping lives in @contenthero/mcp (src/groups.ts). Fix it there and republish.')
  process.exit(1)
}

mkdirSync(join(OUT, 'mcp/tools'), { recursive: true })
mkdirSync(join(OUT, 'cli'), { recursive: true })

for (const g of TOOL_GROUPS) {
  const list = g.tools.map((n) => byName.get(n))
  writeFileSync(join(OUT, `mcp/tools/${g.slug}.mdx`), renderToolPage(g, list))
}

// The CLI's schema output goes to a FILE, not a pipe, and that is not a style choice.
// `contenthero schema` calls process.exit() while stdout still holds buffered data, and
// Node's stdout is async for pipes, so a piped read is silently truncated at the 64KB pipe
// buffer: 65,536 bytes captured against 93,998 written. Measured 2026-09-17 on cli 0.3.4.
// A file redirect is synchronous and complete. Remove this once the CLI sets
// process.exitCode instead of calling process.exit().
const schemaPath = join(tmpdir(), `ch-cli-schema-${process.pid}.json`)
execFileSync('sh', [
  '-c',
  `node ${JSON.stringify(join(REPO, 'node_modules/@contenthero/cli/dist/index.js'))} schema > ${JSON.stringify(schemaPath)}`,
])
const cliSchema = JSON.parse(readFileSync(schemaPath, 'utf8'))
rmSync(schemaPath, { force: true })
writeFileSync(join(OUT, 'cli/reference.mdx'), renderCliPage(cliSchema.commands, cliSchema.globalOptions))

const written = [
  ...TOOL_GROUPS.map((g) => `mcp/tools/${g.slug}.mdx`),
  'cli/reference.mdx',
]

if (!CHECK) {
  console.log(
    `Generated ${TOOL_GROUPS.length} MCP tool pages (${tools.length} tools) and 1 CLI page (${cliSchema.commands.length} commands) from ${generatedFrom()}.`,
  )
  process.exit(0)
}

// --check: compare every generated file against what is committed.
const drifted = []
for (const rel of written) {
  const fresh = readFileSync(join(OUT, rel), 'utf8')
  const committed = existsSync(join(REPO, rel)) ? readFileSync(join(REPO, rel), 'utf8') : null
  if (committed === null) drifted.push(`${rel} is missing`)
  else if (committed !== fresh) drifted.push(`${rel} differs`)
}
rmSync(OUT, { recursive: true, force: true })

if (drifted.length) {
  console.error('The generated reference is out of date:\n  ' + drifted.join('\n  '))
  console.error('\nRun `npm run generate:reference` and commit the result.')
  process.exit(1)
}
console.log(`Reference is current: ${written.length} generated files match the INSTALLED packages (${generatedFrom()}). Run check:currency to confirm those are the PUBLISHED versions; this check alone cannot.`)
process.exit(0)
