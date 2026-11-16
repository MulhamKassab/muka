import { expect, mock, test } from 'claude-code/testing'

import { actualSize, contextNudge, efficiencyReport, guardModel, looksLarge, newWasteState, sizeIn, sizingNote, WASTE_BIG, wasteCheck } from './register'
import type { LogEntry } from '../types'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Body>[1]

const call = (over: Partial<Parameters<typeof wasteCheck>[1]>) => ({ agent: 'main', tool: 'Read', args: {}, isError: false, text: 'ok', at: 1000, ...over })

test('waste catchers: a re-read of an unchanged file, a retry loop, a huge result', () => {
  const st = newWasteState()
  const read = call({ args: { file_path: 'C:\\work\\a.ts' } })
  expect(wasteCheck(st, read)).toEqual([])
  // The same range again, unchanged: pointed out.
  const again = wasteCheck(st, { ...read, at: 2000 })
  expect(again.map(h => h.kind)).toEqual(['reread'])
  expect(again[0]!.nudge).toMatch(/already read a\.ts/)
  // A different range is not a re-read; another agent reading it is not either.
  expect(wasteCheck(st, { ...read, args: { file_path: 'C:\\work\\a.ts', offset: 50 }, at: 2100 })).toEqual([])
  expect(wasteCheck(st, { ...read, agent: 'agent-1', at: 2200 })).toEqual([])
  // After an edit, reading it again is right.
  wasteCheck(st, call({ tool: 'Edit', args: { file_path: 'c:/work/a.ts' }, at: 3000 }))
  expect(wasteCheck(st, { ...read, at: 4000 })).toEqual([])

  // The same command failing: told at the second failure, not the first; a success clears it.
  const bad = call({ tool: 'Bash', args: { command: 'npm test' }, isError: true })
  expect(wasteCheck(st, bad)).toEqual([])
  const twice = wasteCheck(st, bad)
  expect(twice.map(h => h.kind)).toEqual(['retry'])
  expect(twice[0]!.nudge).toMatch(/failed 2 times the same way/)
  expect(wasteCheck(st, { ...bad, isError: false })).toEqual([])
  expect(wasteCheck(st, bad)).toEqual([])

  // A huge result, but not a helper's report.
  const big = 'x'.repeat(WASTE_BIG + 1)
  expect(wasteCheck(st, call({ tool: 'Bash', args: { command: 'cat log.txt' }, text: big })).map(h => h.kind)).toEqual(['big'])
  expect(wasteCheck(st, call({ tool: 'Agent', args: { prompt: 'p' }, text: big }))).toEqual([])
})

test('the context nudge comes once per climb past 70%', () => {
  const st = newWasteState()
  expect(contextNudge(st, 50)).toBeUndefined()
  expect(contextNudge(st, 72)).toMatch(/72% full/)
  expect(contextNudge(st, 80)).toBeUndefined()
  // Compacted, then filling again: told again.
  expect(contextNudge(st, 30)).toBeUndefined()
  expect(contextNudge(st, 75)).toMatch(/75% full/)
})

const engine = (on: On) => {
  mock.store(on)
  mock.env(on, {})
  mock.clock(on)
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  // The tool's answer: a failure for a command that says "fail".
  on('tool.call', (_, e) => {
    const cmd = String((e as unknown as { command?: string }).command ?? '')
    return (cmd.includes('fail') ? { isError: true, result: 'boom', text: 'boom' } : { result: {}, text: 'file text' }) as never
  })
}

test('the nudges reach the agent on the result that showed the waste, and Alerts lists them', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't1', text: 'fix it' } as never)
  const first = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\z.ts' } as never)) as { context?: string[] }
  expect(first.context ?? []).toEqual([])
  const second = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\z.ts' } as never)) as { context?: string[] }
  expect(second.context!.some(c => /already read z\.ts/.test(c))).toBe(true)
  await $.tool.call({ tool: 'Bash', command: 'npm run fail' } as never)
  const loop = (await $.tool.call({ tool: 'Bash', command: 'npm run fail' } as never)) as { context?: string[] }
  expect(loop.context!.some(c => /failed 2 times/.test(c))).toBe(true)
  // Switched off, nothing is said.
  expect((await $.command.run({ command: 'muka', args: 'nudges off' } as never)).text).toMatch(/nudges off/)
  const quiet = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\z.ts' } as never)) as { context?: string[] }
  expect(quiet.context ?? []).toEqual([])
  expect((await $.command.run({ command: 'muka', args: '' } as never)).text).toMatch(/Waste nudges: off/)
})

test('the model guard keeps helpers on the rules\' models', () => {
  expect(guardModel('Explore', 'sonnet')).toBe('haiku')
  expect(guardModel('Explore', 'claude-opus-5-5')).toBe('haiku')
  expect(guardModel('Explore', 'haiku')).toBeUndefined()
  expect(guardModel('builder', 'haiku')).toBe('sonnet')
  expect(guardModel('reviewer', 'opus')).toBe('sonnet')
  expect(guardModel('builder', 'sonnet')).toBeUndefined()
  expect(guardModel('general-purpose', 'fable')).toBe('sonnet')
  expect(guardModel('general-purpose', 'haiku')).toBeUndefined()
  // Left alone: the checker, forks, and a helper that names no model.
  expect(guardModel('checker', 'opus')).toBeUndefined()
  expect(guardModel('fork', 'opus')).toBeUndefined()
  expect(guardModel('Explore', undefined)).toBeUndefined()
})

test('a helper asking for the wrong model is started on the right one, and marked', async ($, on) => {
  engine(on)
  const asked: (string | undefined)[] = []
  on('agent.spawn', (_, e) => {
    asked.push(e.model)
    return { model: e.model === 'haiku' ? 'claude-haiku-5-5' : 'claude-opus-5-5', agentId: `agent-${asked.length}` }
  })
  await $.session.start({ cwd: 'C:\work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't1', text: 'look around' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Scout', prompt: 'p', model: 'opus' } as never)
  expect(asked).toEqual(['haiku'])
  // Switched off, the helper gets what it asked for.
  await $.command.run({ command: 'muka', args: 'models off' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Scout', prompt: 'p', model: 'opus' } as never)
  expect(asked).toEqual(['haiku', 'opus'])
})

test('a prompt that looks large brings the full large-task steps, once', async ($, on) => {
  engine(on)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  await $.session.start({ cwd: 'C:\work', surface: 'terminal', isInteractive: true } as never)
  const small = (await $.prompt.submit({ text: 'fix the typo in the header' } as never)) as { context?: string[] }
  expect(small.context ?? []).toEqual([])
  const big = (await $.prompt.submit({ text: 'start working on these one by one please' } as never)) as { context?: string[] }
  expect(big.context!.some(c => /## Large tasks: plan, then swarm/.test(c))).toBe(true)
  // Once per conversation.
  const again = (await $.prompt.submit({ text: 'refactor the whole project' } as never)) as { context?: string[] }
  expect(again.context ?? []).toEqual([])
})

test('looksLarge reads the size of a prompt', () => {
  expect(looksLarge('fix the typo')).toBe(false)
  expect(looksLarge('what does this function do?')).toBe(false)
  expect(looksLarge('refactor the auth module')).toBe(true)
  expect(looksLarge('do these:\n1. a\n2. b\n3. c')).toBe(true)
  expect(looksLarge(Array(90).fill('word').join(' '))).toBe(true)
})

const entry = (over: Partial<LogEntry>): LogEntry => ({ at: 0, project: 'p', prompt: 'do it', durationMs: 60_000, mainSteps: 5, agents: 0, failed: 0, files: [], tokens: 10_000, costUsd: 0.2, ...over })

test('the size Claude gives a task is read off its text, and checked against what it took', () => {
  expect(sizeIn('Size: M. Two changes...')).toBe('M')
  expect(sizeIn('**Size: L**')).toBe('L')
  expect(sizeIn('the font size is 12')).toBeUndefined()
  expect(actualSize(entry({}))).toBe('S')
  expect(actualSize(entry({ agents: 1, mainSteps: 20 }))).toBe('M')
  expect(actualSize(entry({ agents: 3 }))).toBe('L')
  // Too few sized tasks: nothing to say.
  expect(sizingNote([entry({ size: 'S', agents: 3 })])).toBeUndefined()
  // Often sized too small: told to size up.
  const under = [...Array(4)].map(() => entry({ size: 'S', agents: 2, mainSteps: 30 })).concat([entry({ size: 'S' }), entry({ size: 'M', agents: 1 })])
  expect(sizingNote(under)).toMatch(/4 of 6 tasks turned out bigger than you sized them/)
})

test('the report sums the spend and suggests from the numbers', () => {
  const list = [
    entry({ costUsd: 3, byModel: { opus: 2.5, haiku: 0.5 }, byHelper: { Main: 2.5, Explore: 0.5 }, helperCount: { Explore: 6 }, cacheRate: 40, wasteCount: 2, wasteTokens: 3000, agents: 6, agentSteps: 40, prompt: 'big one' }),
    entry({ costUsd: 0.1, byModel: { opus: 0.1 }, byHelper: { Main: 0.1 }, cacheRate: 50 }),
  ]
  const r = efficiencyReport(list, 7)
  expect(r).toMatch(/^\*\*Muka report, last 7 days:\*\* 2 prompts, about \$3\.10/)
  expect(r).toMatch(/\*\*By model:\*\* opus \$2\.60 \(84%\)/)
  expect(r).toMatch(/Explore \$0\.50 \(6×\)/)
  expect(r).toMatch(/\*\*Caught:\*\* 2 waste nudges/)
  expect(r).toMatch(/- \$3\.00 · p · "big one"/)
  expect(r).toMatch(/on Opus or Fable/)
  expect(r).toMatch(/The cache served only 45%/)
  expect(efficiencyReport([], 7)).toBe('No finished prompts logged in the last 7 days.')
})

test('review fixes: different failing edits are not a retry loop; a solo task of 20 steps is small', () => {
  const st = newWasteState()
  const edit = (old: string) => call({ tool: 'Edit', args: { file_path: 'a.ts', old_string: old, new_string: 'x' }, isError: true })
  expect(wasteCheck(st, edit('one'))).toEqual([])
  expect(wasteCheck(st, edit('two'))).toEqual([])
  expect(wasteCheck(st, edit('two')).map(h => h.kind)).toEqual(['retry'])
  expect(actualSize(entry({ mainSteps: 20 }))).toBe('S')
})
