#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = join(root, 'docs/design-system/style-inventory-baseline.json')
const scopes = {
  designSystem: join(root, 'packages/design-system/src'),
  web: join(root, 'packages'),
  webTheme: join(root, 'packages/dmworkbase/src/theme'),
}

function filesUnder(directory) {
  if (!existsSync(directory)) return []
  const files = []
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'build', 'build-ele', '.turbo', 'coverage', 'out'].includes(entry.name)) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && path.endsWith('.css')) files.push(path)
    }
  }
  visit(directory)
  return files.sort()
}

function scan(directory) {
  const byFile = {}
  const definitions = new Set()
  const uses = new Map()
  let hardcodedColorCount = 0
  let fixedPxCount = 0

  for (const path of filesUnder(directory)) {
    const source = readFileSync(path, 'utf8')
    const colors = source.match(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/gi)?.length ?? 0
    const pixels = source.match(/(?<![\w-])\d+(?:\.\d+)?px\b/g)?.length ?? 0
    for (const match of source.matchAll(/(--[a-z0-9_-]+)\s*:/gi)) definitions.add(match[1])
    for (const match of source.matchAll(/var\(\s*(--[a-z0-9_-]+)/gi)) {
      const name = match[1]
      uses.set(name, (uses.get(name) ?? 0) + 1)
    }
    hardcodedColorCount += colors
    fixedPxCount += pixels
    byFile[relative(root, path)] = { colors, fixedPx: pixels }
  }

  const unresolved = [...uses.entries()]
    .filter(([name]) => !definitions.has(name))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const topFiles = Object.entries(byFile)
    .map(([path, counts]) => ({ path, ...counts, total: counts.colors + counts.fixedPx }))
    .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path))
    .slice(0, 50)

  return {
    files: Object.keys(byFile).length,
    hardcodedColorCount,
    fixedPxCount,
    unresolvedCustomPropertyCount: unresolved.reduce((sum, [, count]) => sum + count, 0),
    unresolvedCustomProperties: unresolved.slice(0, 100).map(([name, count]) => ({ name, count })),
    topFiles,
  }
}

const inventory = {
  schemaVersion: 1,
  scopes: Object.fromEntries(Object.entries(scopes).map(([name, directory]) => [name, scan(directory)])),
}
const designSystemUnresolved = inventory.scopes.designSystem.unresolvedCustomPropertyCount
if (designSystemUnresolved !== 0) {
  console.error(`design-system style lint: ${designSystemUnresolved} unresolved custom-property uses in packages/design-system`)
  process.exitCode = 1
}

if (process.argv.includes('--write-baseline')) {
  writeFileSync(baselinePath, `${JSON.stringify(inventory, null, 2)}\n`)
  console.log(`Wrote ${relative(root, baselinePath)}`)
}

if (process.argv.includes('--check')) {
  if (!existsSync(baselinePath)) {
    console.error(`design-system style lint: missing ${relative(root, baselinePath)}; run with --write-baseline`)
    process.exitCode = 1
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    for (const [scope, current] of Object.entries(inventory.scopes)) {
      const previous = baseline.scopes?.[scope]
      if (!previous) {
        console.error(`design-system style lint: missing baseline scope ${scope}`)
        process.exitCode = 1
        continue
      }
      for (const key of ['hardcodedColorCount', 'fixedPxCount', 'unresolvedCustomPropertyCount']) {
        if (current[key] > previous[key]) {
          console.error(`design-system style lint: ${scope}.${key} increased ${previous[key]} -> ${current[key]}`)
          process.exitCode = 1
        }
      }
    }
  }
}

if (!process.argv.includes('--write-baseline')) {
  console.log(JSON.stringify(inventory, null, 2))
}
