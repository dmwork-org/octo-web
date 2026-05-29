import { describe, expect, it } from 'vitest'
import { resolveAegisRegisterUrl } from '../loginMigrationNoticeUrl'

describe('resolveAegisRegisterUrl', () => {
  it.each([
    ['https://accounts.xming.ai', 'https://accounts.xming.ai/register'],
    ['https://accounts-test.imocto.cn', 'https://accounts-test.imocto.cn/register'],
    ['https://accounts-test.imocto.cn/', 'https://accounts-test.imocto.cn/register'],
  ])('builds the register URL from appconfig account_url %s', (accountUrl, expected) => {
    expect(resolveAegisRegisterUrl(accountUrl)).toBe(expected)
  })

  it.each([
    undefined,
    '',
    'javascript:alert(1)',
    'data:text/html,hello',
    '/account',
  ])('does not fall back when account_url is missing or unsafe: %s', (accountUrl) => {
    expect(resolveAegisRegisterUrl(accountUrl)).toBeUndefined()
  })
})
