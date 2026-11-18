import { expect, mock, test } from 'claude-code/testing'

import { agentIcon, nowLine, STUCK_MS, stuckAgents, warnings } from './register'
import type { SubAgent } from '../types'

const PANE = {
  plugin: 'muka',
  component: 'Pane',
  requestId: 'muka',
  props: { title: 'Savvy', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Body>[1]

const agent = (over: Partial<SubAgent>): SubAgent => ({
  id: 'a',
  type: 'Explore',
  description: 'Look around',
  model: 'haiku 5.5',
  status: 'running',
  startedAt: 0,
  steps: [],
  stepCount: 0,
  ...over,
})

test('the now banner says what is happening and for how long, and flags a stuck agent', () => {
  const now = 10 * 60 * 1000
  expect(nowLine({}, [], now)).toEqual({ text: '● Idle · waiting for you', isStuck: false, isIdle: true })
  const busy = nowLine({}, [agent({ steps: [{ tool: 'Grep', label: 'Grep "x"', at: now - 42_000 }] })], now)
  expect(busy.text).toBe('▶ 🔍 Explore: Grep "x" · 42s')
  // On one step for more than five minutes: stuck.
  const slow = agent({ steps: [{ tool: 'Bash', label: 'Bash: npm test', at: now - STUCK_MS - 60_000 }] })
  expect(stuckAgents([slow], now)).toHaveLength(1)
  const stuck = nowLine({}, [slow], now)
  expect(stuck.isStuck).toBe(true)
  expect(stuck.text).toMatch(/⚠ 🔍 Explore has been on "Bash: npm test" for 6m0s: it may be stuck/)
  expect(warnings({}, [slow]).some(w => /may be stuck/.test(w))).toBe(true)
  // Finished agents are never stuck.
  expect(stuckAgents([{ ...slow, status: 'done' }], now)).toEqual([])
  expect(agentIcon('builder')).toBe('🔨')
  expect(agentIcon('checker')).toBe('✓')
  expect(agentIcon('something-else')).toBe('🤖')
})

const engine = (on: On, seen: { context: string[][] }) => {
  mock.store(on)
  mock.env(on, {})
  mock.clock(on)
  let n = 0
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: ['agent-1'][n++] ?? 'agent-x' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }) as never)
  return seen
}

test('a steer note reaches the agent at its next step, without stopping it', async ($, on) => {
  const seen = engine(on, { context: [] })
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'go' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'Look', subagentType: 'Explore' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 100, rows: 48 } } as never)
  await ui.press({ key: 'tab-steer' })
  // To the Explore helper: a typed note, then a quick one to Main.
  await ui.press({ key: 'steer-to-agent-1' })
  await ui.input({ key: 'steer-text', text: 'Only look in the src folder' })
  await ui.press({ key: 'steer-to-main' })
  await ui.press({ key: 'steer-wrap' })
  expect(await ui.find({ type: 'Text', text: /… \d\d:\d\d:\d\d → Explore: Only look in the src folder \(waiting for its next step\)/ })).toBeDefined()

  // The helper's next tool result carries its note, and only its note.
  const sub = (await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'agent-1' } as never)) as { context?: string[] }
  expect(sub.context).toHaveLength(1)
  expect(sub.context![0]).toMatch(/A note from the user, sent from the Muka panel.*"Only look in the src folder"/)
  // The main agent's next result carries the quick note; a later one carries nothing.
  const first = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\a.ts' } as never)) as { context?: string[] }
  expect(first.context?.[0]).toMatch(/Start wrapping up/)
  const second = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\b.ts' } as never)) as { context?: string[] }
  expect(second.context).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /✓ .* → Main: Start wrapping up.*\(read at \d\d:\d\d:\d\d\)/ })).toBeDefined()
  await ui.unmount()
})

test('the activity feed filters by agent or tool, and a pinned tab opens first in the next chat', async ($, on) => {
  engine(on, { context: [] })
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'go' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'Look', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\a.ts' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'agent-1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 100, rows: 48 } } as never)
  await ui.press({ key: 'tab-activity' })
  const steps = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^\d\d:\d\d:\d\d ●/.test(t))
  expect(await steps()).toHaveLength(3)
  await ui.input({ key: 'feed-search', text: 'bash' })
  expect(await steps()).toEqual([expect.stringMatching(/● Main Bash: npm test$/)])
  await ui.press({ key: 'feed-Explore' })
  expect(await steps()).toEqual([expect.stringMatching(/● Explore Grep "x"$/)])
  await ui.press({ key: 'feed-all' })
  expect(await steps()).toHaveLength(3)

  // A new chat opens on the Bridge.
  await ui.unmount()
  await $.session.start({ cwd: 'C:\work', surface: 'terminal', isInteractive: true } as never)
})
