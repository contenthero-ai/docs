/**
 * The installed CLI's command schema: `contenthero schema commands`, the one read both the reference generator and
 * the tool-name check make. It was two copies of the same shell call, and when the CLI's `schema` command gained a
 * required `kind` (cli 0.3.14, get_schema) both broke the same way.
 *
 * Read through a FILE, not a pipe, and that is not a style choice. The CLI calls process.exit() while stdout still holds
 * buffered data, and Node's stdout is async for pipes, so a piped read is silently truncated at the 64KB pipe buffer:
 * 65,536 bytes captured against 93,998 written (measured 2026-09-17 on cli 0.3.4). A file redirect is synchronous and
 * complete. Remove this once the CLI sets process.exitCode instead of calling process.exit().
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function readCliSchema(repo) {
  const schemaPath = join(tmpdir(), `ch-cli-schema-${process.pid}.json`)
  try {
    execFileSync('sh', [
      '-c',
      `node ${JSON.stringify(join(repo, 'node_modules/@contenthero/cli/dist/index.js'))} schema commands > ${JSON.stringify(schemaPath)}`,
    ])
    return JSON.parse(readFileSync(schemaPath, 'utf8'))
  } finally {
    rmSync(schemaPath, { force: true })
  }
}
