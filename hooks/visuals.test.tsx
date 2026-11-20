import { expect, mock, test } from 'claude-code/testing'

import { agentColor, breadcrumb, isInjected, treeChart, treeParents, treeRows } from './register'
import type { SubAgent } from '../types'

/** A brief that is not thin: the objective, the files, what is known, done-when, the output format. */
const BRIEF = 'Write the mailer in src/mailer.ts and its tests in src/mailer.test.ts. Known: the queue in src/queue.ts already works. Done when the tests pass. Reply with Changed, Tested and Open issues in at most 150 words.'

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
  startedAt: 1000,
  steps: [],
  stepCount: 0,
  ...over,
})

test('the tree puts each helper under the agent that started it', () => {
  const list = [
    agent({ id: 'b', type: 'builder', model: 'sonnet 5.5' }),
    agent({ id: 'e', parentId: 'b', status: 'done' }),
    agent({ id: 'c', type: 'checker', model: 'opus 5.5', status: 'failed' }),
  ]
  const rows = treeRows(list)
  expect(treeParents(rows)).toEqual([undefined, 0, undefined])
  const chart = treeChart({ model: 'claude-sonnet-5-5', isWorking: true }, list)
  expect(chart.source.startsWith('<svg')).toBe(true)
  expect(chart.source.endsWith('</svg>')).toBe(true)
  // Working agents pulse (Main and builder); the arrow to the working builder flows.
  expect(chart.source.match(/attributeName="stroke-opacity"/g)).toHaveLength(2)
  expect(chart.source.match(/attributeName="stroke-dashoffset"/g)).toHaveLength(1)
  // Each agent type has its icon.
  expect(chart.source).toContain('🔨')
  expect(chart.source).toContain('🔍')
  expect(chart.alt).toMatch(/Explore \(haiku 5\.5\) done, started by builder: Look around/)
  // Three edges: Main to builder, builder to Explore, Main to checker.
  expect(chart.source.match(/marker-end=/g)).toHaveLength(3)
  expect(breadcrumb(list, 'e')).toBe('Main › builder › Explore')
  expect(breadcrumb(list, 'missing')).toBe('Main')
  expect(agentColor('Main')).toBe('magenta')
  expect(agentColor('x')).toBe(agentColor('x'))
})

const engine = (on: On) => {
  mock.store(on)
  mock.env(on, {})
  mock.clock(on)
  let n = 0
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: ['agent-1', 'agent-2'][n++] ?? 'agent-x' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('tool.call', () => ({ result: {} }) as never)
}

test('the activity feed lists every step, newest first, and the detail view opens an agent', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'go' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\a.ts' } as never)
  await $.agent.spawn({ prompt: BRIEF, description: 'Find the configs', subagentType: 'Explore' } as never)
  await $.agent.spawn({ prompt: BRIEF, description: 'Check one', subagentType: 'checker', parentAgentId: 'agent-1' } as never)
  for (let i = 0; i < 8; i++) await $.tool.call({ tool: 'Grep', pattern: `p${i}`, agentId: 'agent-1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-2' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 100, rows: 48 } } as never)
  await ui.press({ key: 'tab-activity' })
  const feed = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^\d\d:\d\d:\d\d ●/.test(t))
  expect(feed[0]).toMatch(/● checker Bash: npm test$/)
  expect(feed[1]).toMatch(/● Explore Grep "p7"$/)
  expect(feed[feed.length - 1]).toMatch(/● Main Read a\.ts$/)
  expect(feed).toHaveLength(10)

  // Open the nested checker from the Flow tab: breadcrumb, task, steps.
  await ui.press({ key: 'tab-flow' })
  await ui.press({ key: 'agent-agent-2' })
  expect(await ui.find({ type: 'Text', text: /^Main › Explore › checker$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Task: Check one/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✓ Bash: npm test$/ })).toBeDefined()
  // Up to its parent, which keeps all 8 steps, not just the last 5.
  await ui.press({ key: 'agent-parent' })
  expect(await ui.find({ type: 'Text', text: /^Main › Explore$/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: /✓ Grep "p\d"$/ })).length).toBe(8)
  expect(await ui.find({ type: 'Button', key: 'agent-kid-agent-2' })).toBeDefined()
  await ui.press({ key: 'agent-back' })
  expect(await ui.find({ type: 'Button', key: 'agent-agent-1' })).toBeDefined()
  await ui.unmount()

  // A new prompt clears the feed and closes the open agent.
  await $.turn.start({ turnId: 't-1', text: 'next' } as never)
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await again.press({ key: 'tab-activity' })
  expect(await again.find({ type: 'Text', text: /Nothing yet this prompt/ })).toBeDefined()
  await again.unmount()
})

test('a helper report or task notice arriving as a turn does not wipe the panel', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:\work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'run the demo' } as never)
  await $.agent.spawn({ prompt: BRIEF, description: 'Count tests', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'agent-1' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't-1', agentId: 'agent-1', reason: 'answer' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't-0', reason: 'answer' } as never)

  // The helper's report and a task notice come in as new turns.
  for (const text of ['<agent-message from="a1">\n[Subagent hand-back] done</agent-message>', '<task-notification>\n<task-id>b1</task-id></task-notification>']) {
    await $.turn.start({ turnId: `t-${text.length}`, text } as never)
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 100, rows: 40 } } as never)
  expect(await ui.find({ type: 'Text', text: /✓ Explore \(haiku 5\.5\) · Count tests/ })).toBeDefined()
  await ui.press({ key: 'tab-activity' })
  expect(await ui.find({ type: 'Text', text: /● Explore Grep "x"$/ })).toBeDefined()
  await ui.unmount()

  // A prompt you type still starts afresh.
  await $.turn.start({ turnId: 't-9', text: 'something new' } as never)
  const fresh = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await fresh.find({ type: 'Text', text: /Count tests/ })).toBeUndefined()
  await fresh.unmount()

  expect(isInjected('Another Claude session sent a message:\n<agent-message from="x">')).toBe(true)
  expect(isInjected('[SYSTEM NOTIFICATION - NOT USER INPUT]')).toBe(true)
  expect(isInjected('fix the <div> layout')).toBe(false)
  expect(isInjected('Check it tomorrow')).toBe(false)
})
