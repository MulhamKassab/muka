import { expect, mock, test } from 'claude-code/testing'

import { contextNudge, newWasteState, WASTE_BIG, wasteCheck } from './register'

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
