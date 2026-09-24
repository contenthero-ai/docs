#!/usr/bin/env node
/**
 * Fail when an installed `@contenthero*` package is behind what is published.
 *
 * ## Why this exists, and why it is not a pin-format problem
 *
 * 🚨 ON 2026-09-21 THE DOCS DESCRIBED `@contenthero/mcp@0.4.6` WHILE `0.4.13` WAS PUBLISHED, and
 * `check:reference` was green the whole time. That check regenerates the reference from the same
 * `node_modules` it then diffs against, so it proves the docs match the install and says nothing
 * about whether the install matches the product. Seven patches of tool descriptions, including a
 * renamed render mode, were missing from the public docs with a passing build.
 *
 * ⛔ **"JUST PIN TO `latest`" DOES NOT FIX IT, AND THAT WAS MEASURED, NOT ASSUMED.** With a
 * lockfile present, changing a dependency spec from `"2.0.0"` to `"latest"` and running a plain
 * `npm install` leaves the installed version exactly where it was: the locked entry already
 * SATISFIES the range, so npm never re-resolves. Only an explicit `npm update` moves it. A floating
 * spec changes what a FRESH resolve picks; it does not make an existing install drift forward. So
 * the pin style is a red herring, and swapping it would have traded reproducible builds for a fix
 * that does not work.
 *
 * ⭐⭐⭐ THE DURABLE FIX IS DETECTION, WHICH WORKS UNDER EVERY PIN STYLE. Exact pins stay exact, the
 * build stays reproducible, and falling behind becomes loud instead of invisible.
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

const deps = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) =>
  name.startsWith('@contenthero'),
)

if (deps.length === 0) {
  console.error('check:currency found no @contenthero dependencies to verify. That is almost certainly wrong.')
  process.exit(1)
}

/**
 * ⚠️ READ THE FILE, NOT `require('<name>/package.json')`. A package whose `exports` map does not list
 * `./package.json` (our own `@contenthero-ai/connect` does not) throws ERR_PACKAGE_PATH_NOT_EXPORTED
 * there, which this check reported as "not installed" while it was installed.
 */
const installed = (name) => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}

const published = (name) => {
  // `npm view` rather than a plain fetch: private scopes 404 without the registry auth npm applies.
  return execFileSync('npm', ['view', name, 'dist-tags.latest'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

const behind = []
const unverified = []

for (const [name, spec] of deps) {
  const have = installed(name)
  if (!have) {
    unverified.push(`${name}: declared as "${spec}" but not installed`)
    continue
  }
  let want
  try {
    want = published(name)
  } catch (err) {
    /**
     * ⚠️ A REGISTRY FAILURE MUST NOT PASS. The whole defect class here is a check that is green
     * because it could not see anything, so "could not reach npm" exits non-zero with its own
     * message rather than quietly reporting everything current.
     */
    unverified.push(`${name}: could not read the published version (${err instanceof Error ? err.message.split('\n')[0] : err})`)
    continue
  }
  if (want && have !== want) behind.push({ name, spec, have, want })
}

if (unverified.length > 0) {
  console.error('Could not verify every package, so currency is UNKNOWN rather than fine:')
  for (const u of unverified) console.error(`  - ${u}`)
  process.exit(1)
}

if (behind.length > 0) {
  console.error('Installed packages are behind what is published. The generated reference describes the OLD ones:\n')
  for (const b of behind) console.error(`  ${b.name}  installed ${b.have}  ->  published ${b.want}   (spec "${b.spec}")`)
  console.error('\nBump the pins and regenerate, in this order:')
  console.error(`  npm install ${behind.map((b) => `${b.name}@${b.want}`).join(' ')}`)
  console.error('  npm run generate:reference')
  console.error('\nThen commit both the manifest/lockfile and the regenerated pages.')
  process.exit(1)
}

console.log(`Every @contenthero package is at its published version (${deps.map(([n]) => `${n.split('/').pop()}@${installed(n)}`).join(', ')}).`)
