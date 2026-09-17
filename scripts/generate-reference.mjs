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

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '@contenthero/mcp/dist/server.js'
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
const REPO = dirname(import.meta.dirname)
const OUT = CHECK ? join(tmpdir(), `ch-reference-check-${process.pid}`) : REPO

/* ------------------------------------------------------------------ grouping */

/**
 * Which reference page each tool lands on.
 *
 * Hand-authored on purpose. Grouping is an editorial judgement about what a reader
 * is looking for, and deriving it from the tool name would produce a taxonomy that
 * reshuffles itself every time a tool is renamed. The GUARD below fails the build
 * when a tool exists that no group claims, so this list cannot silently fall behind.
 */
const GROUPS = [
  {
    slug: 'generate',
    title: 'Generate',
    blurb: 'Create images, video, audio and boards, upscale them, and check what a generation is doing.',
    tools: [
      'generate_image', 'generate_video', 'generate_audio', 'generate_board',
      'generate_lip_sync', 'upscale', 'edit_audio', 'transcribe',
      'get_generation_status', 'create_preview', 'get_preview',
      'list_models', 'get_model', 'get_layer_types', 'get_timeline_types',
    ],
  },
  {
    slug: 'media',
    title: 'Media',
    blurb: 'The library: browse, search, import and upload the media an account owns.',
    tools: [
      'list_media', 'get_media', 'search_media', 'import_media',
      'create_media_upload', 'complete_media_upload',
      'list_folders', 'get_folder', 'create_folder', 'update_folder', 'delete_folder',
      'favorite', 'archive',
    ],
  },
  {
    slug: 'characters',
    title: 'Avatars and voices',
    blurb: 'The identity layer: avatars with their looks, and the voices they speak with.',
    tools: [
      'list_avatars', 'get_avatar', 'create_avatar', 'update_avatar', 'delete_avatar',
      'list_voices', 'get_voice',
    ],
  },
  {
    slug: 'planner',
    title: 'Planner',
    blurb: 'Spaces, stages and cards: the content pipeline, and publishing from it.',
    tools: [
      'list_spaces', 'get_space', 'create_space', 'update_space', 'delete_space',
      'list_stages', 'create_stage', 'update_stage', 'delete_stage',
      'list_cards', 'get_card', 'create_card', 'update_card',
      'list_tags', 'create_tag', 'update_tag', 'delete_tag',
      'publish_post', 'list_connected_accounts', 'get_connected_account',
    ],
  },
  {
    slug: 'brand',
    title: 'Brand',
    blurb: 'Brand kits and the knowledge base that grounds generations in your voice.',
    tools: [
      'list_brand_kits', 'get_brand_kit', 'create_brand_kit', 'update_brand_kit',
      'list_brand_knowledge', 'get_brand_knowledge', 'add_brand_knowledge',
      'remove_brand_knowledge', 'search_brand_knowledge',
    ],
  },
  {
    slug: 'editor',
    title: 'Editor and canvas',
    blurb: 'Projects, their timelines and canvases, the elements on them, and exports.',
    tools: [
      'list_projects', 'get_project', 'create_project', 'delete_project',
      'import_project', 'export_project', 'get_export', 'get_export_formats',
      'update_timeline', 'update_canvas', 'get_transcript',
      'list_elements', 'get_element', 'create_element', 'update_element', 'delete_element',
    ],
  },
  {
    slug: 'inspiration',
    title: 'Inspiration',
    blurb: 'The research surface: the social accounts you track, and their posts ranked by outlier score.',
    // list_accounts and get_account are TRACKED SOCIAL ACCOUNTS, not the ContentHero
    // account you are signed in as. list_accounts: "TWO KINDS, in one list: accountType
    // 'inspiration' is the creators and competitors they watch, 'brand' is their OWN
    // profiles." Filing them under an "Account" page misreads the entire research
    // surface, which is what the first draft of this list did.
    tools: ['list_accounts', 'get_account', 'list_content', 'get_content'],
  },
  {
    slug: 'account',
    title: 'Account',
    blurb: 'Your balance and tier, the platforms available to publish to, and what the user is looking at.',
    tools: ['get_balance', 'get_context', 'list_platforms', 'get_platform'],
  },
]

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

// GUARD: every tool must belong to exactly one group, and no group may name a tool
// that no longer exists. This is what stops the grouping list rotting the way the
// hand-written docs did.
const claimed = GROUPS.flatMap((g) => g.tools)
const dupes = claimed.filter((n, i) => claimed.indexOf(n) !== i)
const unclaimed = tools.map((t) => t.name).filter((n) => !claimed.includes(n))
const phantom = claimed.filter((n) => !byName.has(n))
const problems = []
if (dupes.length) problems.push(`tools claimed by two groups: ${dupes.join(', ')}`)
if (unclaimed.length) problems.push(`tools in no group: ${unclaimed.join(', ')}`)
if (phantom.length) problems.push(`groups name tools that do not exist: ${phantom.join(', ')}`)
if (problems.length) {
  console.error('Grouping is out of date:\n  ' + problems.join('\n  '))
  process.exit(1)
}

mkdirSync(join(OUT, 'mcp/tools'), { recursive: true })
mkdirSync(join(OUT, 'cli'), { recursive: true })

for (const g of GROUPS) {
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
  ...GROUPS.map((g) => `mcp/tools/${g.slug}.mdx`),
  'cli/reference.mdx',
]

if (!CHECK) {
  console.log(
    `Generated ${GROUPS.length} MCP tool pages (${tools.length} tools) and 1 CLI page (${cliSchema.commands.length} commands).`,
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
console.log(`Reference is current: ${written.length} generated files match the packages.`)
process.exit(0)
