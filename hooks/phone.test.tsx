import { expect, mock, test } from 'claude-code/testing'
import { phoneText } from './register'

const BRIEF = 'Write the mailer in src/mailer.ts and its tests in src/mailer.test.ts. Known: the queue in src/queue.ts already works. Done when the tests pass. Reply with Changed, Tested and Open issues in at most 150 words.'

const PANE = {
  plugin: 'muka',
  component: 'Pane',
  requestId: 'muka',
  props: { title: 'Muka', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Body>[1]

const engine = (on: On) => {
  mock.store(on)
  mock.env(on, {})
  mock.clock(on)
  let n = 0
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: ['agent-1', 'agent-2'][n++] ?? 'agent-x' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('tool.call', () => ({ result: {} }) as never)
}

const start = async ($: Parameters<Body>[0], surface: 'desktop' | 'mobile') => {
  await $.session.start({ cwd: 'C:/work', surface, isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'build it' } as never)
  await $.agent.spawn({ prompt: BRIEF, description: 'Build the mailer', subagentType: 'builder', model: 'sonnet' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:/work/src/a.ts', agentId: 'agent-1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:/work/src/a.ts', old_string: 'a', new_string: 'b', agentId: 'agent-1' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x' } as never)
}

const alts = async (ui: { findAll: (q: { type: 'Svg' }) => Promise<{ props: Record<string, unknown> }[]> }) => (await ui.findAll({ type: 'Svg' })).map(p => String(p.props.alt))

for (const surface of ['desktop', 'mobile'] as const) {
  test(`${surface}: the Bridge carries the score card; Activity the tool card; Changes files by helper`, async ($, on) => {
    engine(on)
    await start($, surface)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await alts(ui)).some(a => /^Muka Score: /.test(a))).toBe(true)
    await ui.press({ key: 'tab-activity' })
    const act = await alts(ui)
    expect(act.some(a => a.startsWith('Tools · this prompt:') && a.includes('Read 1×'))).toBe(true)
    expect(act.every(a => a.includes('this prompt') || !a.startsWith('Tools'))).toBe(true)
    await ui.press({ key: 'tab-radius' })
    const chg = await alts(ui)
    expect(chg.some(a => a.startsWith('Files by helper:') && /builder 1 file/.test(a))).toBe(true)
    await ui.unmount()
  })
}

test('the phone keeps the Steer tab and its button paths; the desktop hides the tab', async ($, on) => {
  engine(on)
  await start($, 'mobile')
  const phone = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await phone.find({ type: 'Button', key: 'tab-steer' })).toBeDefined()
  // The Bridge keeps the buttons that need no typing.
  for (const k of ['act-wrap', 'act-stop', 'act-verify']) expect(await phone.find({ type: 'Button', key: k })).toBeDefined()
  await phone.press({ key: 'tab-steer' })
  expect(await phone.find({ type: 'Text', text: /Steer: tell an agent/ })).toBeDefined()
  expect((await phone.findAll({ type: 'Button' })).some(b => String(b.props.key).startsWith('steer-'))).toBe(true)
  await phone.unmount()
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desk.find({ type: 'Button', key: 'tab-steer' })).toBeUndefined()
  await desk.unmount()
})

test('the terminal Activity view lists the tools as text', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'go' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-activity' })
  expect(await ui.find({ type: 'Text', text: /Tools this prompt/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Grep.*1×/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
  await ui.unmount()
})

test('/muka phone says who is attached and where the pane stands', () => {
  const none = phoneText({ surfaces: ['desktop'], attaches: [], opened: { isPlaced: false, reason: 'no surface places panes' }, pane: { isPlaced: false, isShown: false } })
  expect(none).toContain('Screens attached now: desktop')
  expect(none).toContain('not placed (no surface places panes)')
  expect(none).toContain('waiting undrawn')
  expect(none).toContain('No phone has attached yet')
  const phone = phoneText({ surfaces: ['desktop', 'mobile'], attaches: [{ surface: 'mobile', clientId: 'mobile:default', at: 0, columns: 42 }], opened: { isPlaced: true }, pane: { isPlaced: true, isShown: true } })
  expect(phone).toContain('mobile')
  expect(phone).toContain('(42 cols)')
  expect(phone).toContain('Opening the pane: placed')
  expect(phone).toContain('open the Mods sheet')
})
