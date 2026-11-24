import { expect, mock, test } from 'claude-code/testing'

import {
  auditReport,
  bridgeCard,
  bridgeStrip,
  cacheChip,
  cacheDropCause,
  coreText,
  dayKey,
  exploreModelNote,
  helperBrief,
  isCacheDrop,
  isScratchPath,
  pluginUses,
  pulseLine,
  reuseNote,
  RULES,
  sizeHelperNote,
  useOf,
  verifyEffect,
} from './register'
import type { MainInfo } from '../types'

/** A brief that is not thin: the objective, the files, what is known, done-when, the output format. */
const BRIEF = 'Write the mailer in src/mailer.ts and its tests in src/mailer.test.ts. Known: the queue in src/queue.ts already works. Done when the tests pass. Reply with Changed, Tested and Open issues in at most 150 words.'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

const MIN = 60_000
const T0 = 1_800_000_000_000

// ---------------------------------------------------------------------------
// The cache chip and the pulse line.

test('the cache chip: nothing before the first turn, green while warm, amber under 10 minutes, cold past the TTL', () => {
  expect(cacheChip({}, 0)).toBeUndefined()
  expect(bridgeStrip({}, [], undefined, 5 * MIN).source).not.toContain('CACHE')
  // Ended at 0; 18 minutes later 42 of 60 are left.
  const warm = cacheChip({ cacheEndAt: 0 }, 18 * MIN)!
  expect(warm.text).toBe('CACHE WARM · 42m')
  expect(warm.hue).toBe('#39ff88')
  const src = bridgeStrip({ cacheEndAt: 0, usage: { input: 100, output: 1, cacheRead: 900, cacheWrite: 0 } }, [], undefined, 18 * MIN).source
  expect(src).toContain('CACHE WARM · 42m')
  expect(src).toContain('90% cached last turn')
  expect(src).toMatch(/stroke="#39ff88" stroke-opacity="\.85"\/><text[^>]*>CACHE WARM · 42m/)
  // Under 10 minutes left: amber.
  expect(cacheChip({ cacheEndAt: 0 }, 55 * MIN + 1000)).toEqual({ text: 'CACHE WARM · 5m', hue: '#ffb547' })
  expect(bridgeCard({ cacheEndAt: 0 }, [], [], undefined, 55 * MIN + 1000).source).toMatch(/stroke="#ffb547" stroke-opacity="\.85"\/><text[^>]*>CACHE WARM · 5m/)
  // Past the TTL: cold, in the mute colour.
  expect(cacheChip({ cacheEndAt: 0 }, 61 * MIN)).toEqual({ text: 'CACHE COLD', hue: '#6f9a83' })
  expect(bridgeStrip({ cacheEndAt: 0 }, [], undefined, 61 * MIN).source).toContain('CACHE COLD')
  // The TTL can be shorter (the 5-minute cache).
  expect(cacheChip({ cacheEndAt: 0 }, 4 * MIN, 5)).toEqual({ text: 'CACHE WARM · 1m', hue: '#ffb547' })
  // Strict XML: no double quote inside an attribute value.
  expect(bridgeStrip({ cacheEndAt: 0 }, [], undefined, 18 * MIN).source).not.toMatch(/="[^"<>]*"[A-Za-z]/)
})

test('the pulse line warns, when idle and under 5 minutes of cache are left, that a pause now costs a full re-read', () => {
  const idle: MainInfo = { isWorking: false, cacheEndAt: 0 }
  expect(pulseLine(idle, [], [], undefined, undefined, 58 * MIN)).toBe('cache expires in 2m: a pause now costs a full re-read')
  expect(pulseLine(idle, [], [], undefined, undefined, 54 * MIN)).toBeUndefined()
  expect(pulseLine(idle, [], [], undefined, undefined, 61 * MIN)).toBeUndefined()
  // Working: the usual line, not the cache warning.
  expect(pulseLine({ ...idle, isWorking: true }, [], [], undefined, undefined, 58 * MIN)).toBe('🧠 Main')
})

// ---------------------------------------------------------------------------
// Pure pieces: the drop test and its causes, the verify fix, the use counts, the texts.

test('a cache drop needs 20,000 input tokens and a 30-point fall; the cause follows the order idle, model, compaction, toggle', () => {
  expect(isCacheDrop(95, 40, 30_000)).toBe(true)
  expect(isCacheDrop(95, 66, 30_000)).toBe(false)
  expect(isCacheDrop(95, 40, 19_999)).toBe(false)
  expect(isCacheDrop(undefined, 10, 30_000)).toBe(false)
  const none = { gapMs: 0, ttlMin: 60, modelChanged: false, compacted: false, changed: false }
  expect(cacheDropCause({ ...none, gapMs: 61 * MIN, modelChanged: true })).toMatch(/^an idle gap \(61m0s\) longer than the 60-minute cache lifetime$/)
  expect(cacheDropCause({ ...none, gapMs: 59 * MIN })).toBe('unknown')
  expect(cacheDropCause({ ...none, modelChanged: true, compacted: true })).toBe('the model changed')
  expect(cacheDropCause({ ...none, compacted: true, changed: true })).toBe('the context was compacted')
  expect(cacheDropCause({ ...none, changed: true })).toBe('a rule or setting was toggled, or plugins reloaded')
})

test('verify: only edits inside the project count; temp and scratchpad files never do', () => {
  const root = 'C:\\work'
  expect(verifyEffect('Edit', { file_path: 'C:\\work\\src\\a.ts' }, root)).toBe('edit')
  expect(verifyEffect('Write', { file_path: 'C:/work/b.ts' }, root)).toBe('edit')
  expect(verifyEffect('Edit', { file_path: 'C:\\elsewhere\\a.ts' }, root)).toBeUndefined()
  expect(verifyEffect('NotebookEdit', { notebook_path: '~/n.ipynb' }, root)).toBeUndefined()
  for (const p of [
    'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\x.js',
    'C:/Users/me/AppData/Local/Temp/x.js',
    '/tmp/x.js',
    'C:\\work\\.scratchpad\\notes.md',
    'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\abc\\scratchpad\\lens.js',
  ]) {
    expect(isScratchPath(p)).toBe(true)
    expect(verifyEffect('Write', { file_path: p }, p.startsWith('C:\\work') ? root : undefined)).toBeUndefined()
  }
  expect(isScratchPath('C:\\work\\src\\template.ts')).toBe(false)
  // A check still verifies; no path or no root keeps the old answer.
  expect(verifyEffect('Edit', {})).toBe('edit')
  expect(verifyEffect('Edit', { file_path: 'C:\\elsewhere\\a.ts' })).toBe('edit')
  expect(verifyEffect('Bash', { command: 'npm test' }, root)).toBe('check')
})

test('use counts: tool servers, plugin skills and plugin-owned agents, matched to a plugin by name', () => {
  expect(useOf('mcp__plugin_vercel_vercel__list_projects', {})).toBe('mcp:plugin_vercel_vercel')
  expect(useOf('mcp__Claude_Browser__navigate', {})).toBe('mcp:Claude_Browser')
  expect(useOf('Skill', { skill: 'vercel:deploy', args: 'prod' })).toBe('skill:vercel:deploy')
  expect(useOf('Skill', { skill: 'verify' })).toBeUndefined()
  expect(useOf('Bash', { command: 'ls' })).toBeUndefined()
  const counts = { 'mcp:plugin_bio-research_biorxiv': 3, 'mcp:plugin_data_hex': 1, 'mcp:figma': 2, 'skill:vercel:deploy': 4, 'agent:vercel:ai-architect': 1, 'agent:builder': 9 }
  expect(pluginUses('bio-research', counts)).toBe(3)
  expect(pluginUses('data', counts)).toBe(1)
  expect(pluginUses('figma', counts)).toBe(2)
  expect(pluginUses('vercel', counts)).toBe(5)
  expect(pluginUses('builder', counts)).toBe(0)
  expect(pluginUses('bio', counts)).toBe(0)
})

test('the audit report: unused plugins, the most used, the way to turn one off', () => {
  const counts = { 'skill:vercel:deploy': 4, 'mcp:plugin_data_hex': 1 }
  const r = auditReport(['vercel', 'data', 'figma', 'airtable'], counts, 3)
  expect(r).toMatch(/^Muka audit: 2 of 4 enabled plugins have no recorded use in the 3 tracked days\./)
  expect(r).toContain('No use:\n- figma\n- airtable')
  expect(r).toContain('Most used:\n- vercel · 4 uses\n- data · 1 use')
  expect(r).toContain('`claude plugin disable <name>`')
  expect(r).toContain('never changes your settings')
  expect(auditReport(['vercel'], counts, 1)).toContain('Every enabled plugin was used.')
  expect(auditReport(['vercel'], {}, 0)).toMatch(/has not recorded any use yet/)
  expect(auditReport([], counts, 3)).toMatch(/no enabled plugins found/)
})

test('the tuned rule texts: the helper table with its exact counts, the brief under 900 characters', () => {
  const text = (id: string) => RULES.find(r => r.id === id)!.text
  expect(text('size')).toContain('- **M**: needs research or reading many files. At most 3 helpers (see "Helpers"); you build.')
  expect(text('size')).toMatch(/\*\*S\*\*: .*No helpers\./)
  expect(text('size')).toContain('at most 6 helpers, in waves of 3')
  const helpers = text('helpers')
  expect(helpers.startsWith('## Helpers: which, when, how many')).toBe(true)
  expect(RULES.find(r => r.id === 'helpers')!.title).toBe('Helpers: which, when, how many')
  // The core keeps the hard numbers and points at the skill; the full table lives in the muka-helpers skill.
  for (const line of [
    'Helpers cost about 4x the tokens of doing the work yourself',
    'S 0 helpers, M at most 3, L at most 6, in waves of at most 3',
    'Always name `model` and `effort` on every Agent call',
        'Load the muka-helpers skill before starting a helper.',
  ]) expect(helpers).toContain(line)
  expect(text('models')).toContain('You MUST name `model` and `effort` on every Agent call')
  expect(text('models')).toContain('Step up a level only after a real shortfall')
  expect(text('models')).toContain('Load the muka-helpers skill first.')
  expect(text('submasters')).toContain('only for an L piece whose parts have their own files: at most 2, and at most two levels below the master unless the user lifts the limit; else it does the piece itself')
  expect(text('submasters')).toContain('150 words')
  expect(text('submasters')).toContain('Load the muka-helpers skill first.')
  expect(text('large')).toContain('at most 3 per wave and 6 in all')
  expect(text('large')).toContain('`reviewer` (opus, high) once')
  expect(text('verify')).toContain('the `verify` skill')
  expect(text('verify')).toContain('targeted tests while working, then the full suite, build, linter and the app')
  expect(RULES.find(r => r.id === 'helpers')!.when).toBe('always')
  const brief = helperBrief(2)
  expect(brief.length).toBeLessThan(900)
  expect(brief).toContain('SendMessage')
  expect(brief).toContain('at most 2, and at most two levels below the master')
  expect(brief).toContain('Explore haiku/low; builder sonnet/medium; opus/high only for a bug that survived two fixes')
  expect(brief).toContain('Step up one level only after a real shortfall')
})

test('the notes quote their rules', () => {
  expect(reuseNote('Explore')).toBe('Muka: a finished Explore helper already has context on this; continue it with SendMessage instead of starting a new one, unless the work is unrelated.')
  expect(sizeHelperNote('S')).toMatch(/S: a few files and a clear change\. Do it yourself and run the tests yourself\. No helpers\./)
  expect(sizeHelperNote('M')).toMatch(/At most 3 helpers \(see "Helpers"\); you build\..*fourth helper/)
  expect(exploreModelNote('opus')).toMatch(/reading runs on haiku/)
})

// ---------------------------------------------------------------------------
// Through the engine.

type Seen = { appended: string[]; asked: (string | undefined)[] }

const engine = (on: On, store: Record<string, unknown> = {}, settings: unknown = {}) => {
  const seen: Seen = { appended: [], asked: [] }
  mock.store(on, store)
  mock.env(on, {})
  const clock = mock.clock(on, { now: T0 })
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: settings }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.append', (_, e, next) => {
    seen.appended.push(String((e as never as { message: { content: { text: string }[] } }).message.content[0]?.text))
    return next(e)
  })
  on('prompt.context', (_, e) => ({ blocks: e.blocks }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  let spawned = 0
  on('agent.spawn', (_, e) => {
    seen.asked.push(e.model)
    return { model: 'claude-sonnet-5-5', agentId: `agent-${++spawned}` }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
  return { seen, clock }
}

const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
}
const ctxOf = (r: unknown): string[] => (r as { context?: string[] }).context ?? []
const muka = ($: Engine, args: string) => $.command.run({ command: 'muka', args } as never)

let turns = 0
const HIGH = { model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 39_000, cache_creation_input_tokens: 0 }
const LOW = { model: 'claude-opus-5-5', input_tokens: 36_000, output_tokens: 10, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 }
const finish = async ($: Engine, usage: typeof HIGH | typeof LOW, over: Record<string, unknown> = {}) => {
  const id = `t${++turns}`
  await $.turn.start({ turnId: id, text: 'go' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer', usage, ...over } as never)
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** How many lines of the Alerts tab match the text. */
const alertCount = async ($: Engine, text: string): Promise<number> => {
  const ui = await $.ui.mount({ plugin: 'muka', component: 'Pane', requestId: 'muka', surface: 'terminal', props: { title: 'Muka', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as never)
  await ui.press({ key: 'tab-notes' })
  const found = await ui.findAll({ type: 'Text', text: new RegExp(esc(text)) })
  await ui.unmount()
  return found.length
}

test('/muka cache shows the TTL, the minutes left and the last hit rate; /muka cache ttl changes and keeps the TTL', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  expect((await muka($, 'cache')).text).toMatch(/^Muka cache: no turn yet, so no cache clock\. TTL 60 minutes/)
  await finish($, HIGH)
  const warm = (await muka($, 'cache')).text
  expect(warm).toContain('warm: 60 of 60 minutes left')
  expect(warm).toContain('Last turn: 98% of its input came from the cache.')
  await clock.set(T0 + 18 * MIN)
  expect((await muka($, 'cache')).text).toContain('warm: 42 of 60 minutes left')
  expect((await muka($, 'cache ttl 10')).text).toBe("Muka cache TTL: 10 minutes. The chip and the expiry warning count down from the end of Main's last request.")
  expect((await muka($, 'cache')).text).toContain('cold: it lapsed 8m0s ago. TTL 10 minutes')
  expect((await muka($, 'cache ttl nope')).text).toMatch(/^Muka cache TTL is 10 minutes\. Use \/muka cache ttl 60/)
  expect((await muka($, 'cache ttl 0')).text).toMatch(/^Muka cache TTL is 10 minutes/)
  // Kept for the next chat.
  await start($)
  expect((await muka($, 'cache')).text).toContain('TTL 10 minutes')
})

test('the rules block is byte-identical across chats; the sizing tune rides the first real prompt once', async ($, on) => {
  const entry = (over: object) => ({ at: 0, project: 'p', prompt: 'do it', durationMs: 60_000, mainSteps: 5, agents: 0, failed: 0, files: [], tokens: 10_000, ...over })
  const bigger = [...Array(4)].map(() => entry({ size: 'S', agents: 2, mainSteps: 30 })).concat([entry({ size: 'S' }), entry({ size: 'M', agents: 1 })])
  engine(on, { [`${dayKey(T0)}seed`]: bigger, [`${dayKey(Date.now())}seed`]: bigger })
  await start($)
  const block = async () => ((await $.prompt.context({ blocks: [] } as never)) as { blocks: { name: string; text: string }[] }).blocks.find(b => b.name === 'mukaRules')!.text
  const first = await block()
  expect(first).toBe(coreText())
  expect(first).not.toContain('sizing check')
  // A new chat, the same rules: the very same bytes.
  await start($)
  expect(await block()).toBe(first)
  // The tune: on the first real prompt, once.
  const one = ctxOf(await $.prompt.submit({ text: 'fix the typo' } as never))
  expect(one).toHaveLength(1)
  expect(one[0]).toMatch(/^Muka's sizing check: in the last week, 4 of 6 tasks turned out bigger/)
  expect(ctxOf(await $.prompt.submit({ text: 'and another' } as never))).toEqual([])
  // A command or a meta prompt is not a real prompt.
  await start($)
  expect(ctxOf(await $.prompt.submit({ text: '/compact', command: 'compact' } as never))).toEqual([])
  expect(ctxOf(await $.prompt.submit({ text: 'meta', isMeta: true } as never))).toEqual([])
  expect(ctxOf(await $.prompt.submit({ text: 'now a real one' } as never))[0]!).toMatch(/sizing check/)
  // Size rule off: no tune, and the block is still the same shape.
  await muka($, 'rule size off')
  await start($)
  expect(ctxOf(await $.prompt.submit({ text: 'real again' } as never))).toEqual([])
  expect(await block()).toBe(coreText(['size']))
})

test('a cache drop is told with its cause, and counted under the context rule', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  const hits = async () => String((await muka($, 'rules')).text).match(/context: Context · checked: (\d+)/)![1]!
  expect(await hits()).toBe('0')

  // 1. An idle gap longer than the TTL.
  await finish($, HIGH)
  await clock.set(T0 + 61 * MIN)
  await finish($, LOW)
  expect(await alertCount($, 'cache dropped 98% → 10%: an idle gap (61m0s) longer than the 60-minute cache lifetime')).toBe(1)
  expect(await hits()).toBe('1')

  // 2. The model changed.
  await finish($, HIGH)
  await finish($, { ...LOW, model: 'claude-sonnet-5-5' })
  expect(await alertCount($, 'cache dropped 98% → 10%: the model changed')).toBe(1)

  // 3. The context was compacted.
  await finish($, HIGH)
  await $.session.measure({ context: { tokens: 160_000, window: 200_000, percent: 80 }, rateLimits: [], changed: ['context'] } as never)
  await $.session.measure({ context: { tokens: 20_000, window: 200_000, percent: 10 }, rateLimits: [], changed: ['context'] } as never)
  await finish($, LOW)
  expect(await alertCount($, 'cache dropped 98% → 10%: the context was compacted')).toBe(1)

  // 4. A rule toggled between the turns.
  await finish($, HIGH)
  await muka($, 'rule models off')
  await finish($, LOW)
  expect(await alertCount($, 'cache dropped 98% → 10%: a rule or setting was toggled, or plugins reloaded')).toBe(1)

  // 5. Plugins reloaded (session.start ran again).
  await finish($, HIGH)
  await start($)
  await finish($, { ...LOW, input_tokens: 30_000, cache_read_input_tokens: 10_000 })
  expect(await alertCount($, 'cache dropped 98% → 25%: a rule or setting was toggled, or plugins reloaded')).toBe(1)
  expect(await hits()).toBe('1')

  // 6. Nothing seen: unknown.
  await finish($, HIGH)
  await finish($, LOW)
  expect(await alertCount($, 'cache dropped 98% → 10%: unknown')).toBe(1)
  expect(await hits()).toBe('2')

  // Not a drop: a small turn, or a fall under 30 points.
  const small = { ...LOW, input_tokens: 9000, cache_read_input_tokens: 1000 }
  await finish($, HIGH)
  await finish($, small)
  const mild = { ...HIGH, input_tokens: 12_000, cache_read_input_tokens: 28_000 }
  await finish($, HIGH)
  await finish($, mild)
  expect(await hits()).toBe('2')
})

test('use counts feed /muka audit; old days are pruned; the report only reads the enabled plugins', async ($, on) => {
  const old = 'use:2020-01-01:gone'
  engine(on, { [old]: { 'mcp:plugin_figma_figma': 5 } }, { enabledPlugins: { 'vercel@market': true, 'bio-research@market': true, 'figma@market': true, 'unused@market': true, 'off@market': false } })
  await start($)
  expect((await muka($, 'audit')).text).toMatch(/enabled, but Muka has not recorded any use yet/)
  await $.tool.call({ tool: 'mcp__plugin_bio-research_biorxiv__search_preprints' } as never)
  await $.tool.call({ tool: 'mcp__plugin_bio-research_biorxiv__get_preprint' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'vercel:deploy' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'verify' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.agent.spawn({ subagentType: 'vercel:ai-architect', description: 'd', prompt: BRIEF, model: 'sonnet' } as never)
  const audit = (await muka($, 'audit')).text
  expect(audit).toMatch(/^Muka audit: 2 of 4 enabled plugins have no recorded use in the 1 tracked day\./)
  expect(audit).toContain('No use:\n- figma\n- unused')
  expect(audit).toContain('- vercel · 2 uses')
  expect(audit).toContain('- bio-research · 2 uses')
  expect(audit).not.toContain('- off')
  expect(audit).toContain('claude plugin disable <name>')
})

test('helpers: starting a type again while a finished one holds the context brings one note, once per type per prompt', async ($, on) => {
  engine(on)
  await start($)
  await muka($, 'rule size off')
  await $.turn.start({ turnId: 'h1', text: 'look around' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'First', prompt: BRIEF, model: 'haiku' } as never)
  // Still running: no note.
  await $.agent.spawn({ subagentType: 'Explore', description: 'Second', prompt: BRIEF, model: 'haiku' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'a' } as never))).toEqual([])
  await $.turn.complete({ answer: 'found', durationMs: 10, isAborted: false, turnId: 'h1', reason: 'answer', agentId: 'agent-1' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Third', prompt: BRIEF, model: 'haiku' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'b' } as never))).toEqual([reuseNote('Explore')])
  // Once per type per prompt; another type has none finished.
  await $.turn.complete({ answer: 'x', durationMs: 10, isAborted: true, turnId: 'h1', reason: 'aborted', agentId: 'agent-2' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Fourth', prompt: BRIEF, model: 'haiku' } as never)
  await $.agent.spawn({ subagentType: 'builder', description: 'Piece', prompt: BRIEF, model: 'sonnet' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'c' } as never))).toEqual([])
  expect((await muka($, 'rules')).text).toMatch(/helpers: Helpers: which, when, how many · checked: 1/)
  expect(await alertCount($, 'Explore started while a finished one already has the context')).toBe(1)
  // The rule off: nothing said.
  await muka($, 'rule helpers off')
  await $.turn.complete({ answer: 'found', durationMs: 10, isAborted: false, turnId: 'h1', reason: 'answer', agentId: 'agent-2' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Fifth', prompt: BRIEF, model: 'haiku' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'd' } as never))).toEqual([])
})

test('size: a helper on a task sized S, or the fourth on one sized M, brings one note quoting the rule', async ($, on) => {
  engine(on)
  // The size Claude gave, as turn.step reads it from Main's text.
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: `Size: ${e.model}`, toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  const say = async (size: string) => {
    for await (const chunk of $.turn.step({ turnId: 's', index: 0, model: size, messageCount: 1 } as never)) void chunk
  }
  await start($)

  await $.turn.start({ turnId: 's1', text: 'small thing' } as never)
  await say('S')
  await $.agent.spawn({ subagentType: 'Explore', description: 'Scout', prompt: BRIEF, model: 'haiku' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'a' } as never))).toEqual([sizeHelperNote('S')])
  // One note per prompt.
  await $.agent.spawn({ subagentType: 'Explore', description: 'Scout 2', prompt: BRIEF, model: 'haiku' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'b' } as never))).toEqual([])

  // The first prompt's two helpers stop, so only this prompt's count.
  await $.turn.complete({ answer: 'x', durationMs: 10, isAborted: true, turnId: 's1', reason: 'aborted', agentId: 'agent-1' } as never)
  await $.turn.complete({ answer: 'x', durationMs: 10, isAborted: true, turnId: 's1', reason: 'aborted', agentId: 'agent-2' } as never)
  await $.turn.start({ turnId: 's2', text: 'medium thing' } as never)
  await say('M')
  await $.agent.spawn({ subagentType: 'Explore', description: 'One', prompt: BRIEF, model: 'haiku' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Two', prompt: BRIEF, model: 'haiku' } as never)
  await $.agent.spawn({ subagentType: 'builder', description: 'Three', prompt: BRIEF, model: 'sonnet' } as never)
  // Three on an M task is within its cap of 3.
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'c' } as never))).toEqual([])
  await $.agent.spawn({ subagentType: 'builder', description: 'Four', prompt: BRIEF, model: 'sonnet' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'd' } as never))).toEqual([sizeHelperNote('M')])
  expect((await muka($, 'rules')).text).toMatch(/size: Size every task first · checked: 2/)

  // Sized L, or the rule off: nothing.
  await muka($, 'rule size off')
  await muka($, 'rule helpers off')
  await $.turn.start({ turnId: 's3', text: 'another small thing' } as never)
  await say('S')
  await $.agent.spawn({ subagentType: 'Explore', description: 'Quiet', prompt: BRIEF, model: 'haiku' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'e' } as never))).toEqual([])
})

test('models: an Explore started on Opus or Fable brings a note that reading runs on Haiku, without changing the model', async ($, on) => {
  const { seen } = engine(on)
  await start($)
  await muka($, 'rule size off')
  await $.turn.start({ turnId: 'm1', text: 'read it' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Scout', prompt: BRIEF, model: 'opus' } as never)
  expect(seen.asked).toEqual(['opus'])
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'a' } as never))).toEqual([exploreModelNote('opus')])
  await $.agent.spawn({ subagentType: 'Explore', description: 'Scout 2', prompt: BRIEF, model: 'claude-fable-5' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'b' } as never))).toEqual([exploreModelNote('fable')])
  // Haiku, or another type on Opus, is fine.
  await $.turn.complete({ answer: 'x', durationMs: 10, isAborted: true, turnId: 'm1', reason: 'aborted', agentId: 'agent-1' } as never)
  await $.agent.spawn({ subagentType: 'Explore', description: 'Scout 3', prompt: BRIEF, model: 'haiku' } as never)
  await $.agent.spawn({ subagentType: 'reviewer', description: 'Review', prompt: BRIEF, model: 'opus' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'c' } as never))).toEqual([])
  expect((await muka($, 'rules')).text).toMatch(/models: Models · checked: 2/)
  await muka($, 'rule models off')
  await muka($, 'rule helpers off')
  await $.agent.spawn({ subagentType: 'Explore', description: 'Quiet', prompt: BRIEF, model: 'opus' } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'd' } as never))).toEqual([])
})

test('verify: an edit outside the project or in a temp folder leaves the verification state alone', async ($, on) => {
  const seen = engine(on)
  void seen
  await start($)
  await $.turn.start({ turnId: 'v1', text: 'edit things' } as never)
  const mounted = async () => {
    const ui = await $.ui.mount({ plugin: 'muka', component: 'Pane', requestId: 'muka', surface: 'desktop', props: { title: 'Muka', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as never)
    const src = String((await ui.find({ type: 'Svg' }))?.props.source)
    await ui.unmount()
    return src
  }
  await $.tool.call({ tool: 'Write', file_path: 'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\x.js', content: 'x' } as never)
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\scratchpad\\y.js', content: 'x' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'D:\\other\\z.ts', old_string: 'a', new_string: 'b' } as never)
  expect(await mounted()).not.toMatch(/VERIFIED/)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\src\\a.ts', old_string: 'a', new_string: 'b' } as never)
  expect(await mounted()).toContain('>⚠ UNVERIFIED<')
})
