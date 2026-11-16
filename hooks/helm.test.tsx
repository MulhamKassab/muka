import { expect, mock, test } from 'claude-code/testing'

import { bridgeStrip, budgetState, orbitChart, planBudget, pulseLine, spendBar } from './register'
import type { SubAgent } from '../types'

const PANE = {
  plugin: 'muka',
  component: 'Pane',
  requestId: 'muka',
  props: { title: 'Helm', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Body>[1]

const agent = (over: Partial<SubAgent>): SubAgent => ({
  id: 'a',
  type: 'builder',
  description: 'Build the mailer',
  model: 'sonnet 5.5',
  status: 'running',
  startedAt: 0,
  steps: [],
  stepCount: 0,
  ...over,
})

test('budgets come from PLAN.md or the default, and measure this prompt only', () => {
  expect(planBudget('# Plan\nBudget: $3\n- piece one')).toBe(3)
  expect(planBudget('- Budget: 2.5')).toBe(2.5)
  expect(planBudget('no budget here')).toBeUndefined()
  expect(budgetState({ costUsd: 5, promptCostStart: 3 }, 4)).toEqual({ budget: 4, spent: 2, pct: 0.5 })
  expect(budgetState({ costUsd: 5, promptCostStart: 3, promptBudget: 2 }, 4)?.pct).toBe(1)
  expect(budgetState({ costUsd: 5 }, undefined)).toBeUndefined()
})

test('the Bridge strip, Orbit and spend bar are well-formed cards', () => {
  const info = {
    model: 'claude-sonnet-5-5',
    prompt: 'Build the mailer',
    isWorking: true,
    turnStartedAt: 0,
    costUsd: 1.84,
    promptCostStart: 0,
    plan: [
      { content: 'Scout', status: 'completed' as const },
      { content: 'Plan', status: 'completed' as const },
      { content: 'Build', status: 'in_progress' as const },
      { content: 'Review', status: 'pending' as const },
    ],
  }
  const list = [agent({ id: 'b1' }), agent({ id: 'e1', type: 'Explore', model: 'haiku 5.5', parentId: 'b1', status: 'done' })]
  const strip = bridgeStrip(info, list, 3, 252_000)
  expect(strip.source).toMatch(/^<svg[\s\S]*<\/svg>$/)
  expect(strip.source).toContain('>MUKA<')
  expect(strip.source).toContain('T+ 04:12 · $1.84 / $3.00')
  expect(strip.alt).toMatch(/progress 2 of 4 steps, now: Build/)
  expect(strip.alt).toMatch(/budget \$1\.84 of \$3\.00/)
  const orbit = orbitChart(info, list, 1000)
  expect(orbit.source).toMatch(/^<svg[\s\S]*<\/svg>$/)
  expect(orbit.alt).toMatch(/Explore \(haiku 5\.5\) done, started by builder/)
  // Each agent shows its model and its steps and time under its name.
  expect(orbit.source).toMatch(/>haiku 5\.5 · \d+s</)
  expect(orbit.source).toMatch(/>sonnet 5\.5 · \d+s</)
  expect(orbit.source).toContain('>0 steps<')
  // Two links: Main to builder, builder to Explore; the working one flows.
  expect(orbit.source.match(/<line /g)).toHaveLength(2)
  expect(orbit.source.match(/<line class="flow"/g)).toHaveLength(1)
  // Motion lives in CSS that only applies when the system allows motion, and each agent has a hover tooltip.
  expect(orbit.source).toContain('@media (prefers-reduced-motion:no-preference)')
  expect(orbit.source).not.toContain('<animate')
  expect(orbit.source).toMatch(/<title>builder · sonnet 5\.5 · running/)
  const spend = spendBar({ sonnet: 0.7, haiku: 0.05 }, 3)
  expect(spend.alt).toBe('Spend by model: sonnet $0.70, haiku $0.05; budget $3.00.')
})

const engine = (on: On) => {
  mock.store(on, { budget: 1 })
  mock.env(on, {})
  mock.clock(on)
  let n = 0
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'helm' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: ['agent-1'][n++] ?? 'agent-x' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }) as never)
}

const cost = (usd: number) => ({ context: { tokens: 1, window: 2, percent: 1 }, rateLimits: [], cost: { usd }, changed: ['cost'] }) as never

test('/muka, /orbit, /helm and /savvy all work, and the budget warns the agents at 70% and 100%', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run({ command: 'helm', args: 'budget' } as never)).text).toMatch(/Muka budget is \$1\.00 per prompt/)
  expect((await $.command.run({ command: 'helm', args: 'budget 2' } as never)).text).toMatch(/Muka budget: \$2\.00 per prompt/)
  expect((await $.command.run({ command: 'orbit', args: 'budget' } as never)).text).toMatch(/Muka budget is \$2\.00 per prompt/)

  await $.session.measure(cost(10))
  await $.turn.start({ turnId: 't-0', text: 'build the mailer' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'Build it', subagentType: 'builder' } as never)
  // PLAN.md sets this prompt's budget to $1.
  await $.tool.call({ tool: 'Write', file_path: 'C:\\tmp\\PLAN.md', content: '# Plan\nBudget: $1\n' } as never)
  await $.session.measure(cost(10.5))
  const quiet = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\a.ts' } as never)) as { context?: string[] }
  expect(quiet.context).toBeUndefined()

  // 70%: Main and the working builder are each told to wrap up, once.
  await $.session.measure(cost(10.75))
  await $.session.measure(cost(10.8))
  const main70 = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\b.ts' } as never)) as { context?: string[] }
  expect(main70.context).toHaveLength(1)
  expect(main70.context![0]).toMatch(/70% of this task's budget is spent/)
  const sub70 = (await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'agent-1' } as never)) as { context?: string[] }
  expect(sub70.context![0]).toMatch(/Start wrapping up/)

  // 100%: one more note each.
  await $.session.measure(cost(11.2))
  const main100 = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\c.ts' } as never)) as { context?: string[] }
  expect(main100.context![0]).toMatch(/budget is spent\. Start no new helpers/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^MUKA · T\+ \d\d:\d\d · \$1\.20 \/ \$1\.00$/ })).toBeDefined()
  await ui.press({ key: 'tab-notes' })
  expect(await ui.find({ type: 'Text', text: /Muka: Budget 100%: \$1\.20 of \$1\.00/ })).toBeDefined()
  // Open the builder from the Bridge and stop it with one press.
  await ui.press({ key: 'tab-flow' })
  await ui.press({ key: 'agent-agent-1' })
  await ui.press({ key: 'agent-stop' })
  const stopped = (await $.tool.call({ tool: 'Grep', pattern: 'y', agentId: 'agent-1' } as never)) as { context?: string[] }
  expect(stopped.context!.some(c => /Stop now: finish nothing new/.test(c))).toBe(true)
  await ui.unmount()

  // A new prompt starts the budget afresh.
  await $.turn.start({ turnId: 't-1', text: 'next task' } as never)
  const fresh = (await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\d.ts' } as never)) as { context?: string[] }
  expect(fresh.context).toBeUndefined()
})

test('on desktop the Bridge is one Muka card under a row of icons', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:\work', surface: 'desktop', isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'build the mailer' } as never)
  await $.agent.spawn({ prompt: 'p', description: 'Build it', subagentType: 'builder' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\work\a.ts', agentId: 'agent-1' } as never)
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // One card: the head, the orbit, the gauges and the latest steps.
  const pictures = await desk.findAll({ type: 'Svg' })
  expect(pictures).toHaveLength(1)
  const alt = String(pictures[0]!.props.alt)
  expect(alt).toMatch(/^Muka\. .*Agent tree. .*Usage limit .*Recent: .*builder Read/)
  const source = String(pictures[0]!.props.source)
  expect(source).toContain('width="400"')
  expect(source).toContain('>MAIN<')
  expect(source).toContain('>CONTEXT<')
  // The views are one row of icons, the open one primary; steering lives on the Bridge, so no Steer icon.
  const tabs = (await desk.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith('tab-'))
  expect(tabs).toHaveLength(8)
  expect(tabs.some(b => b.props.key === 'tab-steer')).toBe(false)
  expect(tabs.filter(b => b.props.variant === 'primary').map(b => b.props.key)).toEqual(['tab-flow'])
  expect(String(tabs[0]!.props.label)).toBe('🧭')
  // The Bridge carries no steering box.
  expect(await desk.find({ type: 'Input', key: 'steer-text' })).toBeUndefined()
  expect(await desk.find({ type: 'Button', key: 'quick-explain' })).toBeUndefined()
  // Spend: the head strip, then spend by model against the budget.
  await desk.press({ key: 'tab-cost' })
  const spendPics = await desk.findAll({ type: 'Svg' })
  expect(spendPics.map(p => String(p.props.alt).split(':')[0])).toEqual([expect.stringMatching(/^Muka/), 'Spend by model', 'This prompt, by agent (est.)'])
  // Every other view is a picture first.
  const first: Record<string, RegExp> = { 'tab-activity': /^Activity lanes: .*builder 1 steps/, 'tab-notes': /^Since your last prompt: failed 0/, 'tab-radius': /^Files changed · 0/, 'tab-cache': /^Prompt cache/, 'tab-reflect': /^Last turn/ }
  for (const [key, alt] of Object.entries(first)) {
    await desk.press({ key })
    const pics = await desk.findAll({ type: 'Svg' })
    expect(String(pics[1]?.props.alt)).toMatch(alt)
  }
  expect(await desk.find({ type: 'Text', text: 'Reflect' })).toBeDefined()
  await desk.unmount()
})

test('the pulse under the prompt: the most urgent thing first, else who works, else the recap', () => {
  const now = 10 * 60_000
  const info = { model: 'claude-opus-5-5', isWorking: true, costUsd: 0.69, promptCostStart: 0, ctxPercent: 41 }
  const working = [agent({ id: 'b1', startedAt: now - 60_000, steps: [{ tool: 'Edit', label: 'Edit a.ts', at: now - 10_000 }] }), agent({ id: 'e1', type: 'Explore', startedAt: now - 30_000 }), agent({ id: 'e2', type: 'Explore', startedAt: now - 20_000 })]
  expect(pulseLine(info, working, [], undefined, 3, now)).toBe('🔨 builder · 🔍 Explore ×2   💲 $0.69/$3.00   ctx 41%')
  expect(pulseLine(info, [], [], undefined, undefined, now)).toBe('🧠 Main   💲 $0.69   ctx 41%')
  // Context nearly full, then the budget, then failures, then a stuck agent: each outranks the last.
  expect(pulseLine({ ...info, ctxPercent: 85 }, working, [], undefined, 3, now)).toBe('🧠 context 85% · compacting soon')
  expect(pulseLine({ ...info, costUsd: 2.4 }, working, [], undefined, 3, now)).toBe('💲 budget 80% spent')
  expect(pulseLine({ ...info, costUsd: 3.2 }, working, [], undefined, 3, now)).toBe('💲 budget spent: $3.20 of $3.00')
  const bad = [{ id: '1', kind: 'failed' as const, agent: 'builder', text: 'x', at: now }, { id: '2', kind: 'error' as const, agent: 'Main', text: 'y', at: now }, { id: '3', kind: 'denied' as const, agent: 'Main', text: 'z', at: now }]
  expect(pulseLine({ ...info, costUsd: 3.2 }, working, bad, undefined, 3, now)).toBe('❌ 2 failed · 🚫 1 denied')
  const slow = [agent({ id: 'b1', startedAt: 0, steps: [{ tool: 'Bash', label: 'Bash: npm test', at: now - 6 * 60_000 }] })]
  expect(pulseLine(info, slow, bad, undefined, 3, now)).toBe('⚠ builder stuck 6m0s on Bash: npm test')
  // Idle: the last task in one line; nothing before the first one.
  const idle = { ...info, isWorking: false }
  const recap = { at: now, durationMs: 252_000, mainSteps: 9, agents: 2, agentSteps: 20, failed: 0, tokens: 1, filesChanged: 6, notices: 0 }
  expect(pulseLine(idle, [], [], recap, 3, now)).toBe('✓ done in 4m12s · 6 files · $0.69')
  expect(pulseLine(idle, [], [], undefined, 3, now)).toBeUndefined()
})
