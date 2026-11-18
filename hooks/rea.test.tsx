import { expect, mock, test } from 'claude-code/testing'

import { reaArgv, reaTail } from './register'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Body>[1]

test('REA runs through the shell on Windows and straight elsewhere', () => {
  expect(reaArgv('C:\\Windows\\system32\\cmd.exe', ['rea-agents@latest', 'setup', '--client', 'claude_code', '--yes'])).toEqual([
    'C:\\Windows\\system32\\cmd.exe',
    '/d',
    '/s',
    '/c',
    'npx -y rea-agents@latest setup --client claude_code --yes',
  ])
  expect(reaArgv(undefined, ['rea-agents@latest', 'doctor'])).toEqual(['npx', '-y', 'rea-agents@latest', 'doctor'])
})

test('what REA prints is shown without colour codes, frames or npm warnings', () => {
  const out = 'npm warn deprecated x\n\u001b[32m◆  Claude Code\u001b[0m\n│  Agent access: Claude Code\n└  Restart Claude Code to load REA.\n'
  expect(reaTail(out)).toBe('Claude Code\nAgent access: Claude Code\nRestart Claude Code to load REA.')
})

const engine = (on: On, files: Map<string, string>, runs: string[][], code: number) => {
  mock.store(on)
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester', ComSpec: 'C:\\Windows\\system32\\cmd.exe' })
  mock.clock(on)
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const norm = (p: string) => p.replace(/\\/g, '/')
  on('fs.read', (_, e) => {
    const v = files.get(norm(String((e as { path: string }).path)))
    if (v === undefined) throw new Error('ENOENT')
    return { value: v } as never
  })
  on('fs.exists', (_, e) => ({ value: files.has(norm(String((e as { path: string }).path))) }) as never)
  on('process.spawn', async function* (_, e) {
    runs.push([...(e as { argv: string[] }).argv])
    yield { stream: 'stdout', text: '◆  Agent access: Claude Code\n└  Restart Claude Code to load REA.\n' } as never
    return { value: { code, signal: null } } as never
  })
}

test('/muka rea shows the status, and /muka rea setup runs REA setup for Claude Code in the background', async ($, on) => {
  const files = new Map<string, string>([['C:/Users/tester/.claude.json', JSON.stringify({ mcpServers: {} })]])
  const runs: string[][] = []
  engine(on, files, runs, 0)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  const before = await $.command.run({ command: 'muka', args: 'rea' } as never)
  expect(before.text).toMatch(/Tools registered with Claude Code: no/)
  expect(before.text).toMatch(/Not set up yet: run \/muka rea setup/)

  const started = await $.command.run({ command: 'muka', args: 'rea setup' } as never)
  expect(started.text).toMatch(/^Setting up REA for Claude Code in the background/)
  files.set('C:/Users/tester/.claude.json', JSON.stringify({ mcpServers: { rea: { command: 'node' } } }))
  files.set('C:/Users/tester/.claude/skills/reverse-engineer-anything', '')
  // Ask until the background run has ended.
  let after = await $.command.run({ command: 'muka', args: 'rea' } as never)
  for (let i = 0; i < 50 && /still running/.test(after.text ?? ''); i++) after = await $.command.run({ command: 'muka', args: 'rea' } as never)
  expect(runs[0]!.at(-1)).toBe('npx -y rea-agents@latest setup --client claude_code --yes')
  expect(after.text).toMatch(/Tools registered with Claude Code: yes/)
  expect(after.text).toMatch(/Skill installed: yes/)
  expect(after.text).toMatch(/Last setup: done/)
  expect(after.text).toMatch(/Restart Claude Code to load REA\./)
})
