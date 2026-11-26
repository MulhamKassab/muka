import { expect, mock, test } from 'claude-code/testing'

import { liveStatus, redactSecrets } from './register'
import type { ActivityItem, FileChange, MainInfo, Notice, SubAgent } from '../types'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

const T0 = 1_800_000_000_000
const long = (n: number) => 'x'.repeat(n)
const helper = (i: number): SubAgent => ({
  id: `a${i}`,
  type: 'builder',
  description: long(400),
  model: 'sonnet',
  status: 'running',
  startedAt: T0,
  steps: [{ tool: 'Edit', label: long(500), at: T0 }],
  stepCount: i,
})

test('liveStatus: an empty state is valid v1 with empty lists', () => {
  const s = liveStatus({ sessionId: 's1', cwd: 'C:\\work\\App\\', info: {}, list: [], feed: [], files: [], notes: [], now: T0 })
  expect(s.v).toBe(1)
  expect(s.sessionId).toBe('s1')
  expect(s.project).toBe('App')
  expect(s.cwd).toBe('C:/work/App')
  expect(s.updatedAt).toBe(T0)
  expect(s.isWorking).toBe(false)
  expect(s.prompt).toBeUndefined()
  expect(s.main).toEqual({})
  expect(s.helpers).toEqual([])
  expect(s.activity).toEqual([])
  expect(s.tools).toEqual([])
  expect(s.changes).toEqual([])
  expect(s.alerts).toEqual([])
  expect(Array.isArray(s.score.pillars)).toBe(true)
})

test('liveStatus: clips text and caps the lists', () => {
  const feed: ActivityItem[] = Array.from({ length: 50 }, (_, i) => ({ tool: i % 2 ? 'Bash' : 'Edit', label: long(500), at: T0 + i, agent: 'Main', ...(i === 3 ? { outcome: 'error' as const } : {}) }))
  const files: FileChange[] = Array.from({ length: 30 }, (_, i) => ({ path: `f${i}.ts`, agents: ['Main'], count: 1, at: T0 + i, edits: [{ at: T0, hunks: [] } as never] }))
  const notes: Notice[] = Array.from({ length: 15 }, (_, i) => ({ id: `n${i}`, kind: 'error', agent: 'Main', text: long(900), at: T0 + i }))
  const info: MainInfo = { prompt: long(600), current: { tool: 'Bash', label: long(500), at: T0 } }
  const s = liveStatus({ sessionId: 's', cwd: '/w/p', info, list: Array.from({ length: 20 }, (_, i) => helper(i)), feed, files, notes, now: T0 })
  expect(s.helpers).toHaveLength(12)
  expect(s.helpers[11]?.id).toBe('a19')
  expect(s.helpers[0]?.description.length).toBeLessThanOrEqual(160)
  expect(s.helpers[0]?.current?.label.length).toBeLessThanOrEqual(160)
  expect(s.activity).toHaveLength(30)
  expect(s.activity[29]?.at).toBe(T0 + 49)
  expect(s.activity[0]?.label.length).toBeLessThanOrEqual(160)
  expect(s.changes).toHaveLength(20)
  expect(s.changes[19]?.path).toBe('f29.ts')
  expect(JSON.stringify(s.changes)).not.toContain('hunks')
  expect(s.alerts).toHaveLength(10)
  expect(s.alerts[0]?.text.length).toBeLessThanOrEqual(300)
  expect(s.prompt?.length).toBeLessThanOrEqual(200)
  expect(s.main.current?.label.length).toBeLessThanOrEqual(160)
  expect(s.tools).toEqual([
    { tool: 'Bash', count: 25, errors: 1 },
    { tool: 'Edit', count: 25, errors: 0 },
  ])
})

test('liveStatus: promptCostUsd is the session cost minus the prompt start, only when both are known', () => {
  const base = { sessionId: 's', cwd: '/w/p', list: [], feed: [], files: [], notes: [], now: T0 }
  expect(Math.abs((liveStatus({ ...base, info: { costUsd: 5, promptCostStart: 3.5 } }).main.promptCostUsd as number) - 1.5)).toBeLessThan(1e-9)
  expect(liveStatus({ ...base, info: { costUsd: 5 } }).main.promptCostUsd).toBeUndefined()
  expect(liveStatus({ ...base, info: { promptCostStart: 1 } }).main.promptCostUsd).toBeUndefined()
  expect(liveStatus({ ...base, info: { costUsd: 5 } }).main.costUsd).toBe(5)
})

// ---------------------------------------------------------------------------
// Through the engine.

const engine = (on: On, store: Record<string, unknown> = {}) => {
  const files = new Map<string, string>()
  mock.store(on, store)
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester' })
  mock.clock(on, { now: T0 })
  on('session.id', () => ({ value: 'sess-live-1' }) as never)
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('prompt.context', (_, e) => ({ blocks: e.blocks }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('fs.write', (_, e) => {
    files.set(e.path.replace(/\\/g, '/'), e.text)
    return { value: undefined } as never
  })
  on('fs.exists', () => ({ value: false }) as never)
  return files
}
const PATH = 'C:/Users/tester/.claude/muka/live/sess-live-1.json'
const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:\\work\\Demo', surface: 'terminal', isInteractive: true } as never)
}
const muka = ($: Engine, args: string) => $.command.run({ command: 'muka', args } as never)
const turn = async ($: Engine, id: string) => {
  await $.turn.start({ turnId: id, text: 'build the thing' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer' } as never)
}

test('a finished turn writes the status file at <home>/.claude/muka/live/<sessionId>.json with v:1', async ($, on) => {
  const files = engine(on)
  await start($)
  await turn($, 't1')
  const s = JSON.parse(files.get(PATH) ?? '{}')
  expect(s.v).toBe(1)
  expect(s.sessionId).toBe('sess-live-1')
  expect(s.project).toBe('Demo')
  expect(s.prompt).toContain('build the thing')
  expect(s.isWorking).toBe(false)
  expect(typeof s.turnStartedAt).toBe('number')
  expect(Array.isArray(s.helpers)).toBe(true)
})

test('/muka live off writes nothing; /muka live on writes again; the help lists it', async ($, on) => {
  const files = engine(on)
  await start($)
  expect((await muka($, '')).text).toContain('- Phone app: /muka live on|off (status file for the Muka Phone web app)')
  expect((await muka($, 'live off')).text).toMatch(/live off/)
  files.clear()
  await turn($, 't2')
  expect(files.size).toBe(0)
  expect((await muka($, 'live on')).text).toMatch(/live on/)
  expect(files.has(PATH)).toBe(true)
})

test('a stored live=false keeps a new session from writing', async ($, on) => {
  const files = engine(on, { live: false })
  await start($)
  await turn($, 't3')
  expect(files.size).toBe(0)
})

test('secrets in labels, prompts and alerts are masked before the phone sees them', () => {
  const r = redactSecrets
  expect(r('curl -H "Authorization: Bearer abc.def.ghi" https://api.x.com/v1/items?key=SECRET123&b=2')).not.toMatch(/abc\.def|SECRET123/)
  expect(r('curl https://api.x.com/v1/items?key=SECRET123')).toBe('curl https://api.x.com/v1/items?…')
  expect(r('export API_KEY=hunter2 && run')).not.toContain('hunter2')
  expect(r('git push --token ghp_abcdefghijklmnop1234')).not.toContain('ghp_abcdefghijklmnop1234')
  expect(r('set password: "p4ss!word"')).not.toContain('p4ss')
  expect(r('aws AKIAIOSFODNN7EXAMPLE s3 ls')).not.toContain('AKIAIOSFODNN7EXAMPLE')
  expect(r('blob a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6')).toBe('blob …')
  // Ordinary steps pass through.
  expect(r('npm test -- src/mailer.test.ts')).toBe('npm test -- src/mailer.test.ts')
  expect(r('Read C:/Users/me/project/src/index.ts')).toBe('Read C:/Users/me/project/src/index.ts')
  const s = liveStatus({
    sessionId: 's1', cwd: 'C:/p', now: 1,
    info: { prompt: 'use token=abc123secret please', current: { tool: 'Bash', label: 'curl https://h.io/a?sig=zzz', at: 1 } },
    list: [], files: [],
    feed: [{ tool: 'WebFetch', label: 'https://h.io/b?api_key=qqq', at: 1, agent: 'Main' }],
    notes: [{ id: 'n', kind: 'risky', agent: 'Main', text: 'ran with password=letmein', at: 1 }],
  })
  const text = JSON.stringify(s)
  for (const bad of ['abc123secret', 'zzz', 'qqq', 'letmein']) expect(text).not.toContain(bad)
})
