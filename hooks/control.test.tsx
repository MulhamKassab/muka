import { expect, mock, test } from 'claude-code/testing'

import { agentCard } from './register'
import type { SubAgent } from '../types'

const PANE = {
  plugin: 'muka',
  component: 'Pane',
  requestId: 'muka',
  props: { title: 'Muka', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Body>[1]

const engine = (on: On) => {
  const toasts: string[] = []
  mock.store(on)
  mock.env(on, {})
  mock.clock(on)
  let n = 0
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: ['agent-1', 'agent-2'][n++] ?? 'agent-x' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('tool.call', () => ({ result: {} }) as never)
  return toasts
}

const start = async ($: Parameters<Body>[0]) => {
  await $.session.start({ cwd: 'C:/work', surface: 'desktop', isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'build it' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'Build the mailer', subagentType: 'builder', model: 'sonnet' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'agent-1' } as never)
}

const context = async ($: Parameters<Body>[0], agentId?: string) =>
  ((await $.tool.call({ tool: 'Grep', pattern: 'q', ...(agentId ? { agentId } : {}) } as never)) as { context?: string[] }).context

test('a chip opens the helper control page: the card, a message box and quick buttons first', async ($, on) => {
  engine(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Tap a helper to open it' })).toBeDefined()
  const chip = await ui.find({ type: 'Button', key: 'agent-agent-1' })
  expect(String(chip!.props.label)).toBe('1 🔨 builder ▸')
  expect(chip!.props.variant).toBe('primary')
  await ui.press({ key: 'agent-agent-1' })
  const pics = await ui.findAll({ type: 'Svg' })
  expect(pics).toHaveLength(1)
  expect(String(pics[0]!.props.alt)).toMatch(/^builder helper \(sonnet 5\.5\), working/)
  expect(String(pics[0]!.props.source)).toContain('>builder<')
  expect(await ui.find({ type: 'Input', key: 'agent-msg' })).toBeDefined()
  for (const k of ['wrap', 'stop', 'explain', 'smaller', 'cheaper', 'verify']) expect(await ui.find({ type: 'Button', key: `agent-q-${k}` })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'agent-back' })).toBeDefined()
  await ui.press({ key: 'agent-back' })
  expect(await ui.find({ type: 'Button', key: 'agent-agent-1' })).toBeDefined()
  await ui.unmount()
})

test('a note typed to a running helper reaches it at its next step; a quick button works too', async ($, on) => {
  const toasts = engine(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'agent-agent-1' })
  await ui.input({ key: 'agent-msg', text: 'Only touch the src folder' })
  const got = await context($, 'agent-1')
  expect(got).toHaveLength(1)
  expect(got![0]).toMatch(/A note from the user, sent from the Muka panel.*"Only touch the src folder"/)
  expect(await context($)).toBeUndefined()
  await ui.press({ key: 'agent-q-verify' })
  const quick = await context($, 'agent-1')
  expect(quick![0]).toMatch(/Verify your piece before reporting: run its tests and build/)
  expect(toasts.some(t => /Sent to builder/.test(t))).toBe(true)
  await ui.unmount()
})

test('a note for a finished helper goes to Main, asking it to resume the helper', async ($, on) => {
  const toasts = engine(on)
  await start($)
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't-1', agentId: 'agent-1', reason: 'answer' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'agent-agent-1' }))!.props.label).toBe('1 🔨 builder ✓')
  await ui.press({ key: 'agent-agent-1' })
  await ui.input({ key: 'agent-msg', text: 'Also add a test' })
  expect(toasts.some(t => /Main will pass it on/.test(t))).toBe(true)
  const main = await context($)
  expect(main).toHaveLength(1)
  expect(main![0]).toContain('Resume the builder helper (agent id agent-1) with SendMessage and give it this from the user: Also add a test')
  // The helper itself gets nothing.
  expect(await context($, 'agent-1')).toBeUndefined()
  // A quick button goes the same way.
  await ui.press({ key: 'agent-q-wrap' })
  const wrap = await context($)
  expect(wrap![0]).toMatch(/Resume the builder helper \(agent id agent-1\) with SendMessage.*Start wrapping up/)
  await ui.unmount()
})

test('agentCard is well-formed SVG with the helper name, model, steps and sub-helpers', () => {
  const kid: SubAgent = { id: 'k1', parentId: 'b1', type: 'Explore', description: 'Look', model: 'haiku 5.5', status: 'done', startedAt: 0, steps: [], stepCount: 2 }
  const a: SubAgent = {
    id: 'b1',
    type: 'builder',
    description: 'Build the mailer & friends',
    model: 'sonnet 5.5',
    status: 'running',
    startedAt: 0,
    steps: [
      { tool: 'Edit', label: 'Edit a.ts', at: 5_000 },
      { tool: 'Bash', label: 'Bash: npm "test"', at: 8_000, outcome: 'error' },
    ],
    stepCount: 2,
  }
  const c = agentCard(a, [a, kid], [], 10_000)
  expect(c.source).toMatch(/^<svg [^>]*viewBox="0 0 400 \d+">[\s\S]*<\/svg>$/)
  expect(c.source).toContain('>builder<')
  expect(c.source).toContain('sonnet 5.5')
  expect(c.source).toContain('class="halo"')
  expect(c.source).toContain('class="ping"')
  expect(c.source).toContain('LAST 2 STEPS')
  expect(c.source).toContain('HELPERS IT STARTED')
  expect(c.source).toContain('>Explore<')
  // The failed step is a red dot.
  expect(c.source).toMatch(/r="5" fill="#ff5c6c"/)
  // No double quote inside an attribute value, and no bare ampersand.
  expect(c.source).not.toMatch(/style="[^"<>]*"[A-Za-z]/)
  expect(c.source).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/)
  expect(c.alt).toMatch(/builder helper \(sonnet 5\.5\), working/)
  expect(c.alt).toContain('Explore (done)')
})
