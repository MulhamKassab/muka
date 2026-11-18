import { expect, mock, test } from 'claude-code/testing'

import {
  editDiff,
  estimateUsd,
  family,
  limitsLine,
  recapText,
  resetTime,
  statusText,
  usd,
  warnings,
} from './register'
import type { LogEntry, SubAgent } from '../types'

const PANE = {
  plugin: 'muka',
  component: 'Pane',
  requestId: 'muka',
  props: { title: 'Savvy', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

const agent = (over: Partial<SubAgent>): SubAgent => ({
  id: 'a',
  type: 'Explore',
  description: 'Look around',
  model: 'haiku 5.5',
  status: 'running',
  startedAt: 1000,
  steps: [],
  stepCount: 0,
  ...over,
})

// ---------------------------------------------------------------------------
// Pure helpers.

test('cost estimates use each model family price', () => {
  expect(family('claude-opus-5-5')).toBe('opus')
  expect(family('haiku 5.5')).toBe('haiku')
  expect(family('gpt-9')).toBeUndefined()
  // 1M fresh input + 1M output on Sonnet: $2 + $10.
  expect(Math.round(estimateUsd({ input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 }, 'claude-sonnet-5-5') * 100)).toBe(1200)
  // Cache reads and writes: Opus 1M read $0.20, 1M write $5.
  expect(Math.round(estimateUsd({ input: 0, output: 0, cacheRead: 1e6, cacheWrite: 1e6 }, 'opus') * 100)).toBe(520)
  expect(estimateUsd(undefined, 'opus')).toBe(0)
  expect(estimateUsd({ input: 5, output: 5, cacheRead: 0, cacheWrite: 0 }, 'unknown')).toBe(0)
  expect(usd(1.234)).toBe('$1.23')
  expect(usd(0.004)).toBe('<$0.01')
  expect(usd(0)).toBe('$0.00')
})

test('limits read as one line, with reset times', () => {
  const now = new Date(2026, 10, 12, 15, 0).getTime()
  const soon = new Date(2026, 10, 12, 18, 30).toISOString()
  const later = new Date(2026, 10, 14, 9, 0).toISOString()
  expect(resetTime(soon, now)).toBe('18:30')
  expect(resetTime(later, now)).toBe('Sat 09:00')
  expect(resetTime('not a date', now)).toBeUndefined()
  expect(limitsLine([{ kind: 'five_hour', percent: 41.4, resetsAt: soon }, { kind: 'seven_day', percent: 12 }], now)).toBe('5h 41% (resets 18:30) · week 12%')
  expect(limitsLine([], now)).toBeUndefined()
  expect(statusText({ model: 'claude-sonnet-5-5', ctxPercent: 41, costUsd: 1.5, limits: [{ kind: 'five_hour', percent: 41 }] })).toBe('sonnet 5.5 · ctx 41% · $1.50 · 5h 41%')
  const w = warnings({ limits: [{ kind: 'five_hour', percent: 85, resetsAt: soon }] }, [])
  expect(w.some(x => /Your 5h usage limit is 85% used/.test(x))).toBe(true)
})

test('edits become diff hunks whose counts match their lines', () => {
  const edit = editDiff('Edit', { old_string: 'a\nb', new_string: 'a\nc\nd' })!
  expect(edit.diff).toBe('@@ -1,2 +1,3 @@\n-a\n-b\n+a\n+c\n+d')
  expect(edit.isCut).toBe(false)
  const write = editDiff('Write', { content: 'x\n\ty' })!
  expect(write.diff).toBe('@@ -0,0 +1,2 @@\n+x\n+\ty')
  expect(editDiff('Read', { file_path: 'a' })).toBeUndefined()
  // A big write is cut, and the header still matches what is kept.
  const big = editDiff('Write', { content: Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n') })!
  expect(big.isCut).toBe(true)
  const [header, ...rest] = big.diff.split('\n')
  expect(header).toBe(`@@ -0,0 +1,${rest.length} @@`)
  // Control characters are dropped, tabs kept.
  expect(editDiff('Edit', { old_string: 'a\u0007', new_string: '\tb\u001b[0m' })!.diff).toBe('@@ -1,1 +1,1 @@\n-a\n+\tb[0m')
})

test('the recap groups a day by project', () => {
  const at = (h: number, m: number) => new Date(2026, 10, 12, h, m).getTime()
  const entries: LogEntry[] = [
    { at: at(9, 5), project: 'Savvy', prompt: 'add the flow chart', durationMs: 300_000, mainSteps: 40, agents: 2, failed: 0, files: ['register.tsx'], tokens: 1000, costUsd: 1.2 },
    { at: at(11, 30), project: 'Portfolio', prompt: 'fix the deploy', durationMs: 60_000, mainSteps: 9, agents: 0, failed: 1, files: [], tokens: 100 },
  ]
  const text = recapText(entries, 'today')
  expect(text).toMatch(/\*\*Recap for today:\*\* 2 prompts in 2 projects, 6m0s of agent time, 1 file changed, about \$1\.20 at API prices, 1 failed or stopped subagent\./)
  expect(text).toMatch(/\*\*Savvy\*\* \(1 prompt\)\n- 09:05 · "add the flow chart" · 5m0s · 1 file · 2 subagents/)
  expect(text).toMatch(/- 11:30 · "fix the deploy" · 1m0s · 1 failed/)
  expect(recapText([], 'yesterday')).toBe('No finished prompts logged for yesterday.')
})

// ---------------------------------------------------------------------------
// Through the engine.

type Calls = { sounds: number; notes: { text: string; key?: string }[]; cancels: string[]; pushes: string[] }

const engine = (on: On, ids = ['agent-1']): Calls => {
  const calls: Calls = { sounds: 0, notes: [], cancels: [], pushes: [] }
  mock.store(on, { guard: true })
  mock.env(on, {})
  mock.clock(on)
  let spawned = 0
  on('session.surfaces', () => ({ value: [] }) as never)
  on('session.id', () => ({ value: 'sess-1' }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('audio.play', () => {
    calls.sounds++
    return { value: undefined } as never
  })
  on('ui.notify', (_, e) => {
    const n = e as unknown as { text: string; key?: string }
    calls.notes.push({ text: n.text, key: n.key })
    return { value: { isSent: true, channel: 'client' } } as never
  })
  on('ui.cancelNotify', (_, e) => {
    calls.cancels.push(String((e as unknown as { key: string }).key))
    return { value: { isCancelled: true } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: ids[spawned++] ?? 'agent-x' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('tool.call', (_, e) => {
    const call = e as unknown as { tool: string; message?: string; questions?: { question: string }[] }
    if (call.tool === 'PushNotification') calls.pushes.push(String(call.message))
    if (call.tool === 'AskUserQuestion') return { result: { questions: call.questions, answers: { [call.questions![0]!.question]: 'Yes' } } } as never
    return { result: {} } as never
  })
  return calls
}

const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:\\work\\Savvy', surface: 'terminal', isInteractive: true } as never)
}

test('usage limits and the exact session cost show in the panel header', async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure({
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 86, resetsAt: new Date(Date.now() + 3600_000).toISOString() },
      { kind: 'seven_day', percentUsed: 12 },
    ],
    cost: { usd: 3.456 },
    changed: ['context', 'rateLimits', 'cost'],
  } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Main agent · .*\$3\.46 this session/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Limits .*5h 86% \(resets \d\d:\d\d\) · week 12%/ })).toBeDefined()
  await ui.press({ key: 'tab-notes' })
  expect(await ui.find({ type: 'Text', text: /Your 5h usage limit is 86% used/ })).toBeDefined()
  await ui.unmount()
})

test('the cost tab splits the session by agent and by model', async ($, on) => {
  engine(on)
  await start($)
  await $.turn.start({ turnId: 't-0', text: 'build it' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'Look', subagentType: 'Explore' } as never)
  await $.turn.complete({
    answer: 'x', durationMs: 5, isAborted: false, turnId: 't-1', agentId: 'agent-1', reason: 'answer',
    usage: { model: 'claude-haiku-5-5', input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as never)
  await $.turn.complete({
    answer: 'x', durationMs: 4000, isAborted: false, turnId: 't-0', reason: 'answer',
    usage: { model: 'claude-sonnet-5-5', input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as never)
  await $.session.measure({ context: { tokens: 1, window: 2, percent: 1 }, rateLimits: [], cost: { usd: 3.5 }, changed: ['cost'] } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-cost' })
  expect(await ui.find({ type: 'Text', text: /Cost at API prices: \$3\.50 this session \(exact\)/ })).toBeDefined()
  // Sonnet: $2 input + $1 output; Haiku: $0.10.
  expect(await ui.find({ type: 'Text', text: /Main · sonnet 5\.5\s+\$3\.00/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Explore · haiku 5\.5\s+\$0\.10/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^sonnet .*\$3\.00/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Not split out .*: \$0\.40/ })).toBeDefined()
  await ui.unmount()
})

test('Blast radius shows a file\'s changes as a diff', async ($, on) => {
  engine(on)
  await start($)
  await $.turn.start({ turnId: 't-0', text: 'go' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\Savvy\\a.ts', old_string: 'const x = 1', new_string: 'const x = 2' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-notes' })
  await ui.press({ key: 'tab-radius' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'file-0' })
  const code = await ui.find({ type: 'Code' })
  expect(code?.props.format).toBe('diff')
  expect(String(code?.props.source)).toBe('@@ -1,1 +1,1 @@\n-const x = 1\n+const x = 2')
  // Pressing again hides it.
  await ui.press({ key: 'file-0' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.unmount()
})

test('a waiting question pings, and the ping is taken back when answered', async ($, on) => {
  const calls = engine(on)
  await start($)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Which one?', header: 'Pick', options: [], multiSelect: false }] } as never)
  expect(calls.sounds).toBe(1)
  expect(calls.notes).toHaveLength(1)
  expect(calls.notes[0]!.text).toBe('Claude is asking: Which one?')
  expect(calls.notes[0]!.key).toMatch(/^ask-/)
  expect(calls.cancels).toEqual([calls.notes[0]!.key])
  // Answered before 40 seconds: no phone push.
  expect(calls.pushes).toHaveLength(0)
})

test('a long task pings when done, the push is not a step, and /savvy ping off silences it', async ($, on) => {
  const calls = engine(on)
  await start($)
  await $.turn.start({ turnId: 't-0', text: 'migrate the database' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 150_000, isAborted: false, turnId: 't-0', reason: 'answer' } as never)
  expect(calls.notes.map(n => n.text)).toEqual(['Done in 2m30s: migrate the database'])
  expect(calls.pushes).toEqual(['Done in 2m30s: migrate the database'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /PushNotification/ })).toBeUndefined()
  await ui.unmount()

  const off = await $.command.run({ command: 'muka', args: 'ping off' } as never)
  expect(off.text).toBe('Muka pings off.')
  await $.turn.start({ turnId: 't-1', text: 'again' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 150_000, isAborted: false, turnId: 't-1', reason: 'answer' } as never)
  expect(calls.notes).toHaveLength(1)
  // A short task never pings.
  await $.command.run({ command: 'muka', args: 'ping on' } as never)
  await $.turn.start({ turnId: 't-2', text: 'quick' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 5_000, isAborted: false, turnId: 't-2', reason: 'answer' } as never)
  expect(calls.notes).toHaveLength(1)
})

test('/savvy recap lists the day\'s finished prompts', async ($, on) => {
  engine(on)
  await start($)
  await $.turn.start({ turnId: 't-0', text: 'fix the login page' } as never)
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\Savvy\\login.ts', content: 'x' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 90_000, isAborted: false, turnId: 't-0', reason: 'answer' } as never)
  const r = await $.command.run({ command: 'muka', args: 'recap' } as never)
  expect(r.text).toMatch(/\*\*Recap for today/)
  expect(r.text).toMatch(/\*\*Savvy\*\* \(1 prompt\)/)
  expect(r.text).toMatch(/"fix the login page" · 1m30s · 1 file/)
  const y = await $.command.run({ command: 'muka', args: 'recap yesterday' } as never)
  expect(y.text).toMatch(/No finished prompts logged for yesterday/)
})

test('the delete guard\'s own question pings, and the ping is taken back', async ($, on) => {
  const calls = engine(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'rm old.log' } as never)
  const guardNotes = calls.notes.filter(n => /^Claude is asking: Allow deleting old\.log/.test(n.text))
  expect(guardNotes).toHaveLength(1)
  expect(calls.sounds).toBeGreaterThan(0)
  expect(calls.cancels).toContain(guardNotes[0]!.key)
})
