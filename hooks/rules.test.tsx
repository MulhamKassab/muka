import { expect, mock, test } from 'claude-code/testing'

import {
  agentConsole,
  contextNudgeAt,
  coreText,
  largeText,
  LARGE_SUMMARY,
  MUKA_CORE,
  MUKA_LARGE,
  MUKA_RULES,
  newWasteState,
  RULES,
  RULES_INTRO,
  rulesCard,
  rulesText,
  SIZE_NOTE,
  UNVERIFIED_NOTE,
  wasteCheck,
} from './register'
import type { SubAgent } from '../types'

/** A brief that is not thin: the objective, the files, what is known, done-when, the output format. */
const BRIEF = 'Write the mailer in src/mailer.ts and its tests in src/mailer.test.ts. Known: the queue in src/queue.ts already works. Done when the tests pass. Reply with Changed, Tested and Open issues in at most 150 words.'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

const PANE = {
  plugin: 'muka',
  component: 'Pane',
  requestId: 'muka',
  props: { title: 'Muka', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

/** The rules every small chat got before the rule controller: this many characters. */
const OLD_CORE_LENGTH = 5592

// ---------------------------------------------------------------------------
// The registry.

test('the registry: nine rules, assembled into the full rules, the core and the large steps', () => {
  expect(RULES.map(r => r.id)).toEqual(['size', 'large', 'helpers', 'models', 'submasters', 'verify', 'context', 'recover', 'questions'])
  expect(RULES.filter(r => r.when === 'large').map(r => r.id)).toEqual(['large'])
  for (const r of RULES) expect(r.text.startsWith('## ')).toBe(true)
  // Every rule on: the exports as before.
  expect(MUKA_RULES).toBe(rulesText())
  expect(MUKA_CORE).toBe(coreText())
  expect(MUKA_LARGE).toBe(largeText())
  expect(MUKA_RULES.startsWith(RULES_INTRO)).toBe(true)
  expect(MUKA_CORE).toContain(LARGE_SUMMARY)
  expect(MUKA_CORE).not.toContain('## Large tasks: plan, then swarm')
  for (const id of ['models', 'context', 'recover']) expect(MUKA_CORE).toContain(RULES.find(r => r.id === id)!.text)
  // A small chat gets no more than it did before.
  expect(MUKA_CORE.length).toBeLessThanOrEqual(OLD_CORE_LENGTH)
})

test('the core is at least 35% shorter than before the helper rules moved into the muka-helpers skill, and keeps the hard numbers', () => {
  // The core was 5160 characters; 35% shorter is 3354.
  expect(MUKA_CORE.length).toBeLessThanOrEqual(3354)
  for (const part of [
    'S 0 helpers, M at most 3, L at most 6, in waves of at most 3',
    'MUST name `model` and `effort` on every Agent call',
    'at most 2, and at most two levels below the master',
    'at most 3 per wave, 6 in all',
    'Load the muka-helpers skill before starting a helper.',
    'the `verify` skill',
  ]) expect(MUKA_CORE).toContain(part)
  // Each of the three helper rules points at the skill.
  expect(MUKA_CORE.split('Load the muka-helpers skill').length - 1).toBe(3)
})

test('the new rule texts say what the rule controller asks', () => {
  const text = (id: string) => RULES.find(r => r.id === id)!.text
  expect(text('models')).toMatch(/MUST name `model` and `effort` on every Agent call/)
  expect(text('models')).toMatch(/default is a fallback/)
  expect(text('models')).toMatch(/Step up a level only after a real shortfall/)
  expect(text('models')).toContain('`opus`/`high` only for an L review or a bug that survived two fixes')
  expect(text('models')).toContain('`sonnet`/`medium` building')
  expect(text('models')).toContain('`haiku`/`low` reading')
  expect(text('context')).toMatch(/50% full, finish the piece in hand and run \/compact \(say so to the user\)/)
  expect(text('context')).toMatch(/fresh chat \(\/clear\)/)
  expect(text('recover')).toMatch(/two failed fixes of the same problem, stop patching: go back to the last good state \(git restore \/ rewind\)/)
  // The rules Muka checks say how.
  expect(RULES.filter(r => r.check).map(r => r.id)).toEqual(['size', 'helpers', 'models', 'verify', 'context', 'recover'])
})

test('a rule switched off is left out of the core, the full rules and the large steps', () => {
  const core = coreText(['models', 'large'])
  expect(core).not.toContain('## Models')
  expect(core).not.toContain(LARGE_SUMMARY)
  expect(core).toContain('## Size every task first')
  expect(core.startsWith(RULES_INTRO)).toBe(true)
  expect(rulesText(['verify'])).not.toContain('## Verify before done')
  expect(largeText(['large'])).toBe('')
  expect(coreText(RULES.map(r => r.id))).toBe(RULES_INTRO)
})

// ---------------------------------------------------------------------------
// Pure checks.

test('the context rule: once at 50% with the /compact wording, the 70% nudge kept', () => {
  const st = newWasteState()
  expect(contextNudgeAt(st, 45)).toBeUndefined()
  const early = contextNudgeAt(st, 52)!
  expect(early.stage).toBe(50)
  expect(early.text).toMatch(/52% full\. Finish the piece in hand, then run \/compact/)
  expect(contextNudgeAt(st, 58)).toBeUndefined()
  expect(contextNudgeAt(st, 71)!.stage).toBe(70)
  // Rule off: only the 70% nudge.
  const quiet = newWasteState()
  expect(contextNudgeAt(quiet, 55, { early: false })).toBeUndefined()
  expect(contextNudgeAt(quiet, 72, { early: false })!.text).toMatch(/72% full/)
  // Nudges off, rule on: only the 50% note.
  const only = newWasteState()
  expect(contextNudgeAt(only, 80, { late: false })!.stage).toBe(50)
})

test('the recover rule: the second identical failure brings the stop-patching wording', () => {
  const st = newWasteState()
  const bad = { agent: 'main', tool: 'Bash', args: { command: 'npm test' }, isError: true, text: 'boom', at: 1 }
  wasteCheck(st, bad, { recover: true })
  const hit = wasteCheck(st, bad, { recover: true })[0]!
  expect(hit.rule).toBe('recover')
  expect(hit.nudge).toMatch(/failed 2 times the same way\. Stop patching: go back to the last good state \(git restore \/ rewind\)/)
  wasteCheck(st, bad, { recover: true })
  // The fourth keeps the old wording.
  expect(wasteCheck(st, bad, { recover: true })[0]!.rule).toBeUndefined()
})

const sub = (over: Partial<SubAgent>): SubAgent => ({ id: 'a', type: 'builder', description: 'd', model: 'sonnet 5.5', status: 'running', startedAt: 0, steps: [], stepCount: 0, ...over })

test('a helper on its default model is marked DEFAULT in the agents console', () => {
  expect(agentConsole([sub({ picked: false })], 1000, 20, 0, 360).parts).toContain('>DEFAULT</text>')
  expect(agentConsole([sub({ picked: true })], 1000, 20, 0, 360).parts).not.toContain('DEFAULT')
  expect(agentConsole([sub({})], 1000, 20, 0, 360).parts).not.toContain('DEFAULT')
})

test('the rules card: a row per rule, ON/OFF, and checked counts', () => {
  const c = rulesCard(RULES, ['context'], { models: 2, verify: 1 })
  expect(c.source.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  expect(c.alt).toBe('Rules: 8 of 9 on. Off: context. Checked: models 2, verify 1.')
  expect(c.source).toContain('RULES · 8 OF 9 ON')
  expect(c.source).toContain('CHECKED · 3')
  expect(c.source.match(/>ON<\/text>/g)).toHaveLength(8)
  expect(c.source.match(/>OFF<\/text>/g)).toHaveLength(1)
  expect(c.source.match(/checked: \d/g)).toHaveLength(6)
  // Strict XML: no double quote inside an attribute value, nothing unescaped.
  expect(c.source).not.toMatch(/="[^"]*"[^\s/>]/)
  expect(c.source).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/)
  expect(rulesCard(RULES, [], {}, true).source).toContain('>PAUSED</text>')
})

// ---------------------------------------------------------------------------
// Through the engine.

type Seen = { appended: string[]; toasts: string[] }

const engine = (on: On, store: Record<string, unknown> = {}): Seen => {
  const seen: Seen = { appended: [], toasts: [] }
  mock.store(on, store)
  mock.env(on, {})
  mock.clock(on)
  let spawned = 0
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.append', (_, e, next) => {
    seen.appended.push(String((e as never as { message: { content: { text: string }[] } }).message.content[0]?.text))
    return next(e)
  })
  on('prompt.context', (_, e) => ({ blocks: e.blocks }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `agent-${++spawned}` }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  // The tool's answer: a failure for a command that says "fail".
  on('tool.call', (_, e) =>
    (String((e as unknown as { command?: string }).command ?? '').includes('fail') ? { isError: true, result: 'boom', text: 'boom' } : { result: {}, text: 'ok' }) as never,
  )
  return seen
}

const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't1', text: 'do the thing' } as never)
}

const ctxOf = (r: unknown): string[] => (r as { context?: string[] }).context ?? []
const muka = ($: Engine, args: string) => $.command.run({ command: 'muka', args } as never)

test('a rule switched off is not injected; switching tells the chat in one note naming it', async ($, on) => {
  const seen = engine(on)
  await start($)
  const all = (await $.prompt.context({ blocks: [] } as never)) as { blocks: { name: string; text: string }[] }
  expect(all.blocks[0]!.text).toContain('## Models')
  const off = await muka($, 'rule models off')
  expect(off.text).toBe('Muka rule off: Models.')
  expect(seen.appended.at(-1)).toBe('Muka: the rule Models is now off and no longer applies in this chat.')
  const without = (await $.prompt.context({ blocks: [] } as never)) as { blocks: { name: string; text: string }[] }
  expect(without.blocks[0]!.text).not.toContain('## Models')
  expect(without.blocks[0]!.text).toContain('## Size every task first')
  // The same setting again sends no second note.
  await muka($, 'rule models off')
  expect(seen.appended).toHaveLength(1)
  await muka($, 'rule models on')
  expect(seen.appended.at(-1)).toMatch(/^Muka: the rule Models is now on\. From now on, follow it:\n\n## Models/)
})

test('a rule kept off in the store is off in a new chat', async ($, on) => {
  engine(on, { rulesOff: ['large', 'verify'] })
  await start($)
  const ctx = (await $.prompt.context({ blocks: [] } as never)) as { blocks: { name: string; text: string }[] }
  expect(ctx.blocks[0]!.text).toBe(coreText(['large', 'verify']))
  // The large steps are not sent either.
  const big = await $.prompt.submit({ text: 'refactor the whole project one by one' } as never)
  expect(ctxOf(big)).toEqual([])
})

test('/muka rules lists every rule with its state and checks; /muka rule rejects an unknown id', async ($, on) => {
  engine(on)
  await start($)
  await muka($, 'rule recover off')
  const list = (await muka($, 'rules')).text
  expect(list).toMatch(/^Muka rules \(on\); 8 of 9 switched on:/)
  expect(list).toMatch(/- ON  models: Models · checked: 0/)
  expect(list).toMatch(/- OFF recover: Recover · checked: 0/)
  expect(list).toMatch(/- ON  large: Large tasks: plan, then swarm \(large prompts\)\n/)
  expect(list).toMatch(/- ON  questions: Questions\n/)
  expect((await muka($, 'rule nope off')).text).toMatch(/^Muka has no rule nope\. The rules: size, large/)
  expect((await muka($, 'rule all off')).text).toMatch(/^Muka rules off: Size every task first, /)
  expect((await muka($, 'rules')).text).toMatch(/0 of 9 switched on/)
  expect((await muka($, 'rules on')).text).toMatch(/^Muka rules on:/)
  expect((await muka($, 'status')).text).toMatch(/- Rules switched on: 9 of 9/)
})

test('models: a helper started without a model is marked, counted, and its starter told', async ($, on) => {
  engine(on)
  await start($)
  await $.agent.spawn({ subagentType: 'builder', description: 'Piece', prompt: BRIEF } as never)
  const next = ctxOf(await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\a.ts' } as never))
  expect(next).toContain('Muka: you started builder without naming a model, so it runs on its default (sonnet 5.5). Name a model and effort on every helper call.')
  // A helper that starts one hears it on its own next step, not Main.
  await $.agent.spawn({ subagentType: 'Explore', description: 'Scout', prompt: BRIEF, parentAgentId: 'agent-1' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'x' } as never)).some(c => /started Explore/.test(c))).toBe(false)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'y', agentId: 'agent-1' } as never))).toContain(
    'Muka: you started Explore without naming a model, so it runs on its default (sonnet 5.5). Name a model and effort on every helper call.',
  )
  // Named: nothing said; a fork is left alone.
  await $.agent.spawn({ subagentType: 'builder', description: 'Named', prompt: BRIEF, model: 'sonnet' } as never)
  await $.agent.spawn({ subagentType: 'fork', description: 'Fork', prompt: BRIEF } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'z' } as never)).some(c => /without naming a model/.test(c))).toBe(false)
  expect((await muka($, 'rules')).text).toMatch(/models: Models · checked: 2/)
  // The console marks it.
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const pics = await desk.findAll({ type: 'Svg' })
  expect(pics.some(p => String(p.props.source).includes('>DEFAULT</text>'))).toBe(true)
  await desk.unmount()
  // Off: neither marked nor told.
  await muka($, 'rule models off')
  await $.agent.spawn({ subagentType: 'builder', description: 'Quiet', prompt: BRIEF } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'w' } as never)).some(c => /without naming a model/.test(c))).toBe(false)
})

test('context: at 50% Main hears the /compact note on its next result; off, it waits for 70%', async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure({ context: { tokens: 100_000, window: 200_000, percent: 52 }, rateLimits: [], changed: ['context'] } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\a.ts' } as never)).some(c => /52% full\. Finish the piece in hand, then run \/compact/.test(c))).toBe(true)
  expect((await muka($, 'rules')).text).toMatch(/context: Context · checked: 1/)
  // Compacted, the rule off: nothing at 55%.
  await muka($, 'rule context off')
  await $.session.measure({ context: { tokens: 20_000, window: 200_000, percent: 10 }, rateLimits: [], changed: ['context'] } as never)
  await $.session.measure({ context: { tokens: 110_000, window: 200_000, percent: 55 }, rateLimits: [], changed: ['context'] } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\b.ts' } as never)).some(c => /full/.test(c))).toBe(false)
})

test('verify: a turn that changed files without a check is flagged, and the next prompt carries the note', async ($, on) => {
  const seen = engine(on)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\a.ts', old_string: 'a', new_string: 'b' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(seen.toasts).toContain('♻️ Main finished without verifying its changes')
  const next = await $.prompt.submit({ text: 'thanks' } as never)
  expect(ctxOf(next)).toEqual([UNVERIFIED_NOTE])
  // Delivered once.
  expect(ctxOf(await $.prompt.submit({ text: 'again' } as never))).toEqual([])
  expect((await muka($, 'rules')).text).toMatch(/verify: Verify before done · checked: 1/)
  // Listed under Alerts.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-notes' })
  expect(await ui.find({ type: 'Text', text: /Main: Main finished without verifying its changes/ })).toBeDefined()
  await ui.unmount()

  // Edited, then tested: nothing to say.
  await $.turn.start({ turnId: 't2', text: 'next fix' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\b.ts', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer' } as never)
  expect(ctxOf(await $.prompt.submit({ text: 'ok' } as never))).toEqual([])

  // The rule off: an unverified finish passes.
  await muka($, 'rule verify off')
  await $.turn.start({ turnId: 't3', text: 'another' } as never)
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\c.ts', content: 'x' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't3', reason: 'answer' } as never)
  expect(ctxOf(await $.prompt.submit({ text: 'ok' } as never))).toEqual([])
})

test('size: no "Size:" line by Main\'s third tool call brings one note; off, none', async ($, on) => {
  engine(on)
  await start($)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'a' } as never))).toEqual([])
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'b' } as never))).toEqual([])
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'c' } as never))).toEqual([SIZE_NOTE])
  // Once per prompt.
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'd' } as never))).toEqual([])
  expect((await muka($, 'rules')).text).toMatch(/size: Size every task first · checked: 1/)
  await muka($, 'rule size off')
  await $.turn.start({ turnId: 't2', text: 'next one' } as never)
  for (const p of ['e', 'f', 'g', 'h']) expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: p } as never))).toEqual([])
})

test('recover: with the nudges off, the second identical failure still brings the recover note', async ($, on) => {
  engine(on)
  await start($)
  await muka($, 'nudges off')
  await $.tool.call({ tool: 'Bash', command: 'npm run fail' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Bash', command: 'npm run fail' } as never)).some(c => /Stop patching/.test(c))).toBe(true)
  expect((await muka($, 'rules')).text).toMatch(/recover: Recover · checked: 1/)
})

test('the Rules view: a card, a switch per rule, All on and All off', async ($, on) => {
  const seen = engine(on)
  await start($)
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await desk.press({ key: 'tab-rules' })
  const card = (await desk.findAll({ type: 'Svg' })).find(p => /^Rules:/.test(String(p.props.alt)))
  expect(String(card?.props.alt)).toBe('Rules: 9 of 9 on. Checked: nothing yet.')
  expect((await desk.find({ type: 'Button', key: 'rule-verify' }))?.props.variant).toBe('primary')
  await desk.press({ key: 'rule-verify' })
  expect((await desk.find({ type: 'Button', key: 'rule-verify' }))?.props.variant).toBe('secondary')
  expect(seen.appended.at(-1)).toMatch(/the rule Verify before done is now off/)
  expect((await muka($, 'rules')).text).toMatch(/- OFF verify/)
  await desk.press({ key: 'rules-all-off' })
  expect((await desk.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith('rule-')).every(b => b.props.variant === 'secondary')).toBe(true)
  await desk.press({ key: 'rules-all-on' })
  expect((await desk.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith('rule-')).every(b => b.props.variant === 'primary')).toBe(true)
  await desk.unmount()
  // In the terminal: a line per rule.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-rules' })
  expect(await ui.find({ type: 'Text', text: /^ON  Models · checked: 0/ })).toBeDefined()
  await ui.unmount()
})
