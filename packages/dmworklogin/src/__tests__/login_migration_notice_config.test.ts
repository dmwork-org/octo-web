import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import { parseRemoteBool } from '../../../dmworkbase/src/Utils/remoteConfig'

const repoRoot = path.resolve(__dirname, '../../../..')

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8')
}

describe('login migration notice remote config', () => {
  it.each([
    [0, false],
    ['0', false],
    [undefined, false],
    [1, true],
    ['1', true],
    [true, true],
    ['true', true],
    ['false', false],
  ])('parses appconfig value %s as suppressLoginMigrationNotice=%s', (value, expected) => {
    expect(parseRemoteBool(value)).toBe(expected)
  })

  it('reads suppress_login_migration_notice from appconfig', () => {
    const source = readRepoFile('packages/dmworkbase/src/App.tsx')

    expect(source).toContain('suppressLoginMigrationNotice: boolean = false')
    expect(source).toContain('result["suppress_login_migration_notice"]')
    expect(source).toContain('previousSuppressLoginMigrationNotice')
    expect(source).toContain('notifyConfigChangeListeners')
  })

  it('hides the migration notice link and click interception when enabled', () => {
    const source = readRepoFile('packages/dmworklogin/src/login.tsx')

    expect(source).toContain('showMigrationNotice={!WKApp.remoteConfig.suppressLoginMigrationNotice}')
    expect(source).toContain('if (!showMigrationNotice || hasAcknowledgedMigrationNotice())')
    expect(source).toContain('{showMigrationNotice && (')
    expect(source).toContain('visible={showMigrationNotice && migrationNoticeVisible}')
    expect(source).toContain('addConfigChangeListener(forceUpdate)')
  })
})
