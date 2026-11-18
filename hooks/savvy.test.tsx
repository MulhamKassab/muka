import { expect, mock, test } from 'claude-code/testing'

import {
  bar,
  cacheRate,
  clean,
  clip,
  findDeletes,
  findRisks,
  flowChart,
  GUARD_DENY,
  isOutside,
  normPath,
  reviewPrompt,
  shortModel,
  stepLabel,
  treeRows,
  warnings,
} from './register'
import type { SubAgent } from '../types'

const PANE = {
  plugin: 'muka',
  component: 'Pane',
  requestId: 'muka',
  props: {
    title: 'Savvy',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

const engine = (on: On, ids = ['agent-1']) => {
  // Nothing sits beneath the plugin: each hook here stands for the engine.
  mock.store(on)
  let spawned = 0
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: ids[spawned++] ?? `agent-${spawned}` }))
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
}

const agent = (over: Partial<SubAgent>): SubAgent => ({
  id: 'a',
  type: 'Explore',
  description: 'Look around',
  model: 'haiku 5.5',
  status: 'running',
  startedAt: Date.now(),
  steps: [],
  stepCount: 0,
  ...over,
})

test('helpers', () => {
  expect(shortModel('claude-sonnet-5-5')).toBe('sonnet 5.5')
  expect(shortModel('claude-opus-5-5[1m]')).toBe('opus 5.5')
  expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
  expect(shortModel(undefined)).toBe('?')
  expect(bar(0, 0)).toBe('░░░░░░░░░░')
  expect(bar(1, 2)).toBe('█████░░░░░')
  expect(bar(41, 100)).toBe('████░░░░░░')
  expect(clip('abcdef', 4)).toBe('abc…')
  expect(clip('abc', 4)).toBe('abc')
})

test('step labels say what a tool call does', () => {
  expect(stepLabel('Read', { file_path: 'C:\\code\\hooks\\register.tsx' })).toBe('Read register.tsx')
  expect(stepLabel('Edit', { file_path: '/a/b/c.ts' })).toBe('Edit c.ts')
  expect(stepLabel('Grep', { pattern: 'agent.spawn' })).toBe('Grep "agent.spawn"')
  expect(stepLabel('Bash', { command: 'npm   test\n --watch' })).toBe('Bash: npm test --watch')
  expect(stepLabel('Bash', { command: 'ls', description: 'List files' })).toBe('Bash: List files')
  expect(stepLabel('Agent', { description: 'Find configs', subagent_type: 'Explore' })).toBe('Agent: Find configs')
  expect(stepLabel('mcp__github__create_issue', {})).toBe('create_issue (MCP)')
  expect(stepLabel('TodoWrite', {})).toBe('TodoWrite')
  expect(stepLabel('Bash', { command: 'x'.repeat(200) }).length).toBe(80)
})

test('the tree nests each subagent under the agent that started it', () => {
  const rows = treeRows([
    agent({ id: 'a' }),
    agent({ id: 'b', parentId: 'a' }),
    agent({ id: 'c' }),
    agent({ id: 'd', parentId: 'gone' }),
    agent({ id: 'e', parentId: 'e' }),
  ])
  expect(rows.map(r => `${r.agent.id}:${r.depth}`)).toEqual(['a:0', 'b:1', 'c:0', 'd:0', 'e:0'])
  expect(rows[0]!.prefix).toBe('├─ ')
  expect(rows[1]!.prefix).toBe('│  └─ ')
  expect(rows[4]!.prefix).toBe('└─ ')
})

test('the flow chart escapes what agents report and stays well formed', () => {
  const chart = flowChart({ model: 'claude-opus-5-5' }, [
    agent({ id: 'a', description: 'Check <b> & "quotes"', steps: [{ tool: 'Grep', label: 'Grep "a<b"', at: 0 }], stepCount: 1 }),
    agent({ id: 'b', parentId: 'a', status: 'failed', usage: { input: 2345, output: 1000, cacheRead: 9000, cacheWrite: 0 } }),
  ])
  expect(chart.source.startsWith('<svg')).toBe(true)
  expect(chart.source.endsWith('</svg>')).toBe(true)
  expect(chart.source).not.toContain('<b>')
  expect(chart.source).toContain('&lt;b&gt; &amp; &quot;quotes&quot;')
  expect(chart.source).toContain('12k tok')
  expect(chart.source.length).toBeLessThan(131072)
  expect(chart.alt).toContain('Main agent (opus 5.5)')
  expect(chart.alt).toContain('Explore (haiku 5.5) failed')

  const big = flowChart({}, Array.from({ length: 50 }, (_, i) => agent({ id: `x${i}`, description: 'y'.repeat(300) })))
  expect(big.source.length).toBeLessThan(131072)
})

test('a subagent shows running, then done, with both bars, on every surface', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const spawned = await $.agent.spawn({
    prompt: 'Find the config files',
    description: 'Find config files',
    subagentType: 'Explore',
  } as never)
  // The spawn's own result goes back untouched.
  expect(spawned.agentId).toBe('agent-1')

  await $.session.measure({
    context: { tokens: 82000, window: 200000, percent: 41 },
    rateLimits: [],
    changed: ['context'],
  })

  for (const surface of ['terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Explore \(haiku 5\.5\).*Find config files.*running/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0\/1 done/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /41% \(82k \/ 200k\)/ })).toBeDefined()
    await ui.unmount()
  }
  {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    // On desktop the header is a card: the first picture; the orbit follows.
    const pictures = await ui.findAll({ type: 'Svg' })
    expect(String(pictures[0]!.props.alt)).toMatch(/subagents 0\/1 done/)
    const svg = pictures.find(p => String(p.props.alt).includes('Agent tree.'))
    expect(svg).toBeDefined()
    expect(String(svg!.props.alt)).toMatch(/Agent tree\. .*Explore \(haiku 5\.5\) running, started by Main: Find config files/)
    // The Orbit draws the helper by name; its task is in the description.
    expect(String(svg!.props.source)).toContain('>Explore<')
    await ui.unmount()
  }

  await $.turn.complete({
    answer: 'found them',
    durationMs: 1000,
    isAborted: false,
    turnId: 't-1',
    agentId: 'agent-1',
    reason: 'answer',
    usage: { model: 'claude-haiku-5-5', input_tokens: 9000, output_tokens: 1000, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
  })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 2000,
    isAborted: false,
    turnId: 't-0',
    reason: 'answer',
    usage: { model: 'claude-sonnet-5-5' } as never,
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /1\/1 done/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Explore.*done.*12k tok/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Main agent · sonnet 5\.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Main · Waiting for you/ })).toBeDefined()
  await ui.unmount()
})

test('each agent shows its current step, and nested subagents sit under their parent', async ($, on) => {
  engine(on, ['agent-1', 'agent-2'])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ turnId: 't-0', text: 'go' } as never)

  // The main agent's own steps.
  await $.tool.call({ tool: 'Read', file_path: '/repo/hooks/register.tsx' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/hooks/register.tsx' } as never)

  await $.agent.spawn({ prompt: 'p', description: 'Survey the code', subagentType: 'Explore' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'Check one file', subagentType: 'checker', parentAgentId: 'agent-1' } as never)

  // A subagent's steps, the last one current; an unknown loop's are ignored.
  for (let i = 0; i < 7; i++) {
    await $.tool.call({ tool: 'Grep', pattern: `p${i}`, agentId: 'agent-1' } as never)
  }
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-2' } as never)
  const unknown = await $.tool.call({ tool: 'Bash', command: 'x', agentId: 'compaction-9' } as never)
  // The call's own result goes back untouched.
  expect(unknown).toMatchObject({ result: {} })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Main · Edit register\.tsx · 2 steps/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /└─ ● Explore.*Survey the code.*7 steps/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /↳ Grep "p6"/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /└─ ● checker.*Check one file.*1 step\b/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /↳ Bash: npm test/ })).toBeDefined()
  await ui.unmount()

  // A new prompt resets the main agent's step count.
  await $.turn.start({ turnId: 't-1', text: 'next' } as never)
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await again.find({ type: 'Text', text: /Main · Thinking/ })).toBeDefined()
  await again.unmount()
})

test('/muka on and off switch the panel; a bare /muka shows the status', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const status = await $.command.run({ command: 'muka', args: '' } as never)
  expect(status.text).toMatch(/^Muka\n- Panel: on .*\n- Smart rules: on /)
  const off = await $.command.run({ command: 'muka', args: 'off' } as never)
  expect(off.text).toBe('Muka off.')
  const back = await $.command.run({ command: 'muka', args: 'on' } as never)
  expect(back.text).toBe('Muka on: the Muka panel shows the agents at work.')
})

test('Savvy is on and the delete guard is off by default', async ($, on) => {
  mock.store(on)
  const opened: string[] = []
  let asked = 0
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', (_, e) => {
    opened.push(String((e as unknown as { id: string }).id))
    return { value: { isPlaced: true } }
  })
  on('tool.call', (_, e) => {
    if ((e as unknown as { tool: string }).tool === 'AskUserQuestion') asked++
    return { result: {} } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // The panel opens with nothing stored.
  expect(opened).toEqual(['muka'])
  // A delete runs with no question.
  expect(await $.tool.call({ tool: 'Bash', command: 'rm -rf build' } as never)).toMatchObject({ result: {} })
  expect(asked).toBe(0)
})
