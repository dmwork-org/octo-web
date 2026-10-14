#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = join(root, 'packages/design-system/src/tokens.json')
const cssPath = join(root, 'packages/design-system/src/css/tokens.css')
const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const css = readFileSync(cssPath, 'utf8')

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function kebab(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[.]/g, '-')
    .toLowerCase()
}

function expectedDeclarations() {
  const expected = new Map()
  const add = (name, value, theme = 'light') => expected.set(`${theme}:${name}`, String(value))
  for (const [name, value] of Object.entries(contract.font)) add(`--ds-font-${kebab(name)}`, value)
  for (const [name, value] of Object.entries(contract.fontWeight)) add(`--ds-font-weight-${kebab(name)}`, value)
  for (const [name, value] of Object.entries(contract.typography)) {
    add(`--ds-font-size-${kebab(name)}`, value.size)
    add(`--ds-line-height-${kebab(name)}`, value.lineHeight)
    add(`--ds-font-weight-${kebab(name)}`, value.weight)
  }
  for (const [group, values] of Object.entries(contract)) {
    if (!['space', 'radius', 'layout', 'motion'].includes(group)) continue
    for (const [name, value] of Object.entries(values)) {
      if (group === 'layout' && name.startsWith('controlHeight')) {
        add(`--ds-control-height-${kebab(name.slice('controlHeight'.length))}`, value)
      } else {
        add(`--ds-${group}-${kebab(name)}`, value)
      }
    }
  }
  add('--ds-state-disabled-opacity', contract.state.disabledOpacity)
  add('--ds-focus-ring-width', contract.state.focusRingWidth)
  add('--ds-focus-ring-offset', contract.state.focusRingOffset)
  const lightTheme = contract.theme.light
  for (const [theme, values] of Object.entries(contract.theme)) {
    for (const [group, entries] of Object.entries(values)) {
      for (const [name, value] of Object.entries(entries)) {
        const lightValue = lightTheme[group]?.[name]
        if (theme === 'dark' && value === lightValue) continue
        add(`--ds-${group}-${kebab(name)}`, value, theme)
      }
    }
  }
  return expected
}

function parseDeclarations(source) {
  const declarations = new Map()
  for (const match of source.matchAll(/(--ds-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    declarations.set(match[1], match[2].trim())
  }
  return declarations
}

function normalizeCssValue(value) {
  return value.replace(/(^|[ (])0\./g, '$1.')
}

const canonical = `${canonicalize(contract)}\n`
const sha256 = createHash('sha256').update(canonical).digest('hex')
const darkStart = css.indexOf(':root[data-theme="dark"]')
if (darkStart < 0) throw new Error('tokens.css is missing the dark theme selector')
const lightDeclarations = parseDeclarations(css.slice(0, darkStart))
const darkDeclarations = parseDeclarations(css.slice(darkStart))
const errors = []

for (const [key, value] of expectedDeclarations()) {
  const [theme, name] = key.split(':')
  const declarations = theme === 'dark' ? darkDeclarations : lightDeclarations
  if (!declarations.has(name)) errors.push(`${name} is missing from ${theme} tokens.css declarations`)
  else if (normalizeCssValue(declarations.get(name)) !== normalizeCssValue(value)) errors.push(`${name} ${theme} value mismatch: ${declarations.get(name)} != ${value}`)
}

const marker = css.match(/@octo-design-system-contract-sha256:\s*([a-f0-9]{64})/i)?.[1]
if (marker && marker !== sha256) errors.push(`tokens.css contract hash mismatch: ${marker} != ${sha256}`)
if (process.argv.includes('--check') && !marker) errors.push('tokens.css is missing @octo-design-system-contract-sha256 marker')

const result = {
  version: contract.version,
  sha256,
  canonicalBytes: Buffer.byteLength(canonical),
  declarationCount: expectedDeclarations().size,
  contractPath,
  cssPath,
}
if (errors.length) {
  console.error(errors.map(error => `design-system contract: ${error}`).join('\n'))
  process.exitCode = 1
}
console.log(JSON.stringify(result, null, 2))
