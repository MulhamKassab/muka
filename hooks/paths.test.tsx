import { expect, test } from 'claude-code/testing'
import { hidePaths } from './register'

test('Should know shows file names, not paths', () => {
  expect(hidePaths('C:\\Users\\me\\AppData\\Local\\Temp\\guard-test\\block-me.txt · 1 file (72 B) (blocked)')).toBe('block-me.txt · 1 file (72 B) (blocked)')
  expect(hidePaths('C:/Users/M1465~1.KAS/scratchpad/guard-test/block-me.txt (ran without asking: no one to ask)')).toBe('block-me.txt (ran without asking: no one to ask)')
  expect(hidePaths('Write C:\\Users\\me\\.bashrc is outside the project folder')).toBe('Write .bashrc is outside the project folder')
  expect(hidePaths('/home/me/proj/build/ · 3 files (2 KB)')).toBe('build/ · 3 files (2 KB)')
  expect(hidePaths('rm -rf ./dist ../old/out: force')).toBe('rm -rf dist out: force')
  // A path with a space keeps no folder names either.
  expect(hidePaths('Bash: rm "C:/My Dir/c.txt"')).not.toMatch(/C:|\//)
  // Links are kept whole.
  expect(hidePaths('WebFetch https://example.com/a/b failed')).toBe('WebFetch https://example.com/a/b failed')
  // Text with no paths is unchanged.
  expect(hidePaths('Explore: Try a thing: failed (error)')).toBe('Explore: Try a thing: failed (error)')
})
