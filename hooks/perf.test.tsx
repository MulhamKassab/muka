import { expect, test } from 'claude-code/testing'
import { findDeletes, findRisks } from './register'
test('assignment chains stay quick', () => {
  const t0 = Date.now()
  expect(findDeletes('$x = '.repeat(20000) + 'Remove-Item x', 'powershell')).toHaveLength(1)
  findRisks('$x += '.repeat(20000) + 'Remove-Item x', 'powershell')
  expect(Date.now() - t0).toBeLessThan(2000)
})
