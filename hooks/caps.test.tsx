import { expect, mock, test } from 'claude-code/testing'

import {
  cacheDropCause,
  capCheck,
  capDeny,
  capSoftNote,
  isThinBrief,
  LONG_REPORT,
  LONG_REPORT_NOTE,
  nextDepth,
  nextTrimMode,
  THIN_BRIEF_NOTE,
  totalCap,
  trimModeOf,
  trimThreshold,
} from './register'
import type { SubAgent } from '../types'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

const T0 = 1_800_000_000_000
/** A brief that is not thin: the objective, the files, what is known, done-when, the output format. */
const BRIEF = 'Write the mailer in src/mailer.ts and its tests in src/mailer.test.ts. Known: the queue in src/queue.ts already works. Done when the tests pass. Reply with Changed, Tested and Open issues in at most 150 words.'

const sub = (over: Partial<SubAgent>): SubAgent => ({ id: 'a', type: 'builder', description: 'd', model: 'sonnet', status: 'running', startedAt: 0, steps: [], stepCount: 0, ...over })

// ---------------------------------------------------------------------------
// Pure.

test('capCheck: S 0, M 3, L or unsized 6 for Main; 3 running under Main, 2 under a helper; depth by level', () => {
  const base = { list: [] as SubAgent[], parentId: undefined, size: undefined, started: 0, maxDepth: 2, helpersOn: true, submastersOn: true }
  expect(totalCap('S')).toBe(0)
  expect(totalCap('M')).toBe(3)
  expect(totalCap('L')).toBe(6)
  expect(totalCap(undefined)).toBe(6)
  expect(capCheck({ ...base, size: 'S' })?.kind).toBe('total')
  expect(capCheck({ ...base, size: 'M', started: 2 })).toBeUndefined()
  expect(capCheck({ ...base, size: 'M', started: 3 })?.kind).toBe('total')
  expect(capCheck({ ...base, size: 'L', started: 5 })).toBeUndefined()
  expect(capCheck({ ...base, started: 6 })?.kind).toBe('total')
  // Running at once.
  const three = [sub({ id: 'a' }), sub({ id: 'b' }), sub({ id: 'c' })]
  expect(capCheck({ ...base, list: three.slice(0, 2) })).toBeUndefined()
  expect(capCheck({ ...base, list: three })?.kind).toBe('running')
  // A finished helper and a fork do not count.
  expect(capCheck({ ...base, list: [sub({ id: 'a', status: 'done' }), sub({ id: 'b', type: 'fork' }), sub({ id: 'c' })] })).toBeUndefined()
  // Under a helper: 2.
  const kids = [sub({ id: 'p' }), sub({ id: 'k1', parentId: 'p' }), sub({ id: 'k2', parentId: 'p' })]
  expect(capCheck({ ...base, list: kids, parentId: 'p' })?.kind).toBe('running')
  expect(capCheck({ ...base, list: kids.slice(0, 2), parentId: 'p' })).toBeUndefined()
  // Depth: level 3 is past 2; 3 allows it; 0 is no limit.
  const deep = [sub({ id: 'p' }), sub({ id: 'q', parentId: 'p' })]
  expect(capCheck({ ...base, list: deep, parentId: 'q' })?.kind).toBe('depth')
  expect(capCheck({ ...base, list: deep, parentId: 'q', maxDepth: 3 })).toBeUndefined()
  expect(capCheck({ ...base, list: deep, parentId: 'q', maxDepth: 0 })).toBeUndefined()
  // The rule off: its caps are not checked.
  expect(capCheck({ ...base, size: 'S', helpersOn: false })).toBeUndefined()
  expect(capCheck({ ...base, list: deep, parentId: 'q', submastersOn: false })).toBeUndefined()
  // The texts.
  const hit = capCheck({ ...base, size: 'S' })!
  expect(capDeny(hit)).toBe('Muka: helper cap for this prompt: 0 started, the limit for a task sized S is 0. Do it yourself, or say a new size.')
  expect(capSoftNote(hit)).toContain('It started, but start no more: do it yourself, or say a new size.')
})

test('thin briefs: code-writing helpers need 200 characters and a file-like token; an Explore, 100 characters', () => {
  expect(isThinBrief('builder', 'do A')).toBe(true)
  expect(isThinBrief('builder', BRIEF)).toBe(false)
  // Long enough, but no path and no file name.
  expect(isThinBrief('builder', 'Make the mailer send the welcome message when someone signs up, retry three times when it fails, and log every attempt so we can see what happened later. Reply in 150 words, e.g. Changed.')).toBe(true)
  expect(isThinBrief('builder', `${'x'.repeat(190)} see mailer.ts`)).toBe(false)
  expect(isThinBrief('general-purpose', 'short')).toBe(true)
  expect(isThinBrief('Explore', 'x'.repeat(99))).toBe(true)
  expect(isThinBrief('Explore', 'x'.repeat(100))).toBe(false)
  // Readers other than Explore and forks are not checked.
  expect(isThinBrief('reviewer', 'p')).toBe(false)
  expect(isThinBrief('fork', 'p')).toBe(false)
})

test('trim modes: the stored boolean maps to on/off, nothing to auto; the button cycles auto, on, off; the thresholds', () => {
  expect(trimModeOf(true)).toBe('on')
  expect(trimModeOf(false)).toBe('off')
  expect(trimModeOf(undefined)).toBe('auto')
  expect(trimModeOf('off')).toBe('off')
  expect(trimModeOf('nonsense')).toBe('auto')
  expect(nextTrimMode('auto')).toBe('on')
  expect(nextTrimMode('on')).toBe('off')
  expect(nextTrimMode('off')).toBe('auto')
  expect(nextDepth(2)).toBe(3)
  expect(nextDepth(3)).toBe('off')
  expect(nextDepth(0)).toBe(2)
  // auto: 20,000 always; the threshold from 40% context, or for a helper.
  expect(trimThreshold('auto', 12_000, true, 10)).toBe(20_000)
  expect(trimThreshold('auto', 12_000, true, undefined)).toBe(20_000)
  expect(trimThreshold('auto', 12_000, true, 39)).toBe(20_000)
  expect(trimThreshold('auto', 12_000, true, 40)).toBe(12_000)
  expect(trimThreshold('auto', 12_000, false, 0)).toBe(12_000)
  expect(trimThreshold('auto', 40_000, true, 90)).toBe(20_000)
  expect(trimThreshold('on', 12_000, true, 0)).toBe(12_000)
  expect(trimThreshold('off', 12_000, true, 99)).toBeUndefined()
})

test('the cache-drop cause names an effort change after a model change and before the tool list', () => {
  const seen = { gapMs: 0, ttlMin: 60, modelChanged: false, compacted: false, changed: false }
  expect(cacheDropCause({ ...seen, effortChanged: true })).toBe('effort changed')
  expect(cacheDropCause({ ...seen, effortChanged: true, modelChanged: true })).toBe('the model changed')
  expect(cacheDropCause({ ...seen, effortChanged: true, tools: 'figma' })).toBe('effort changed')
  expect(cacheDropCause({ ...seen, compacted: true })).toBe('the context was compacted')
})

// ---------------------------------------------------------------------------
// Through the engine.

const engine = (on: On, store: Record<string, unknown> = {}) => {
  const files = new Map<string, string>()
  const prompts: string[] = []
  const said = { size: '' }
  mock.store(on, store)
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester' })
  mock.clock(on, { now: T0 })
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('prompt.context', (_, e) => ({ blocks: e.blocks }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  let spawned = 0
  on('agent.spawn', (_, e) => {
    prompts.push(e.prompt)
    return { model: 'claude-sonnet-5-5', agentId: `agent-${++spawned}` }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: said.size ? `Size: ${said.size}` : '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('fs.write', (_, e) => {
    files.set(e.path.replace(/\\/g, '/'), e.text)
    return { value: undefined } as never
  })
  on('fs.exists', () => ({ value: false }) as never)
  on('tool.call', (_, e) => {
    const c = e as unknown as { tool: string; size?: number }
    const n = c.size ?? 0
    if (c.tool === 'Bash') {
      const stdout = Array.from({ length: Math.ceil(n / 37) + 1 }, (__, i) => `row ${String(i).padStart(5, '0')} ok payload payload payload`).join('\n')
      return { result: { stdout, stderr: '', interrupted: false }, text: stdout } as never
    }
    return { result: {}, text: 'ok' } as never
  })
  return { files, prompts, said }
}

const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
}
const muka = ($: Engine, args: string) => $.command.run({ command: 'muka', args } as never)
const ctxOf = (r: unknown): string[] => (r as { context?: string[] }).context ?? []
const stdoutOf = (r: unknown): string => String((r as { result: { stdout: string } }).result.stdout)
const spawn = ($: Engine, subagentType: string, over: Record<string, unknown> = {}) =>
  $.agent.spawn({ subagentType, description: 'd', prompt: BRIEF, model: 'sonnet', ...over } as never) as Promise<{ deny?: string; agentId?: string }>
/** Main's next tool result's notes. */
const notes = async ($: Engine): Promise<string[]> => ctxOf(await $.tool.call({ tool: 'Grep', pattern: 'a' } as never))
/** A helper stopped: it no longer runs, and it is not "finished" either. */
const stop = ($: Engine, agentId: string) =>
  $.turn.complete({ answer: 'x', durationMs: 10, isAborted: true, turnId: 'x', reason: 'aborted', agentId } as never)
/** The size Claude gave, as turn.step reads it from Main's text. */
const sized = async ($: Engine, said: { size: string }, size: string) => {
  said.size = size
  for await (const chunk of $.turn.step({ turnId: 's', index: 0, model: size, messageCount: 1 } as never)) void chunk
}

test('soft caps: a helper over the per-prompt total still starts, with one note per prompt; S 0, M 3, unsized 6', async ($, on) => {
  const { said } = engine(on)
  await start($)
  await muka($, 'rule size off')
  await $.turn.start({ turnId: 'a', text: 'one small thing' } as never)
  await sized($, said, 'S')
  expect((await spawn($, 'builder')).agentId).toBe('agent-1')
  expect(await notes($)).toEqual([capSoftNote(capCheck({ list: [], parentId: undefined, size: 'S', started: 0, maxDepth: 2, helpersOn: true, submastersOn: true })!)])
  // One note per prompt.
  await stop($, 'agent-1')
  expect((await spawn($, 'builder')).agentId).toBe('agent-2')
  expect(await notes($)).toEqual([])
  expect((await muka($, 'caps')).text).toMatch(/Helpers per prompt: 0 for a task sized S.*started this prompt: 2/)
  await stop($, 'agent-2')

  // M: three are fine, the fourth is noted.
  await $.turn.start({ turnId: 'b', text: 'a medium thing' } as never)
  await sized($, said, 'M')
  for (const id of ['agent-3', 'agent-4', 'agent-5']) {
    expect((await spawn($, 'builder')).agentId).toBe(id)
    await stop($, id)
  }
  expect(await notes($)).toEqual([])
  expect((await spawn($, 'builder')).agentId).toBe('agent-6')
  expect((await notes($))[0]).toContain('helper cap for this prompt: 3 started, the limit for a task sized M is 3')
  await stop($, 'agent-6')

  // Unsized: the limit is 6.
  await $.turn.start({ turnId: 'c', text: 'no size said' } as never)
  for (let i = 0; i < 6; i++) await stop($, (await spawn($, 'builder')).agentId!)
  expect(await notes($)).toEqual([])
  await spawn($, 'builder')
  expect((await notes($))[0]).toContain('the limit for a task sized L or unsized is 6')
  // The hits are counted under the helpers rule.
  expect((await muka($, 'rules')).text).toMatch(/helpers: Helpers: which, when, how many · checked: [1-9]/)
})

test('hard caps: a helper over the total is refused with what to do instead; a fork and the rule off are exempt', async ($, on) => {
  const { prompts, said } = engine(on)
  await start($)
  await muka($, 'rule size off')
  expect((await muka($, 'caps hard on')).text).toMatch(/^Muka hard caps on/)
  await $.turn.start({ turnId: 'a', text: 'one small thing' } as never)
  await sized($, said, 'S')
  const refused = await spawn($, 'builder')
  expect(refused.deny).toBe('Muka: helper cap for this prompt: 0 started, the limit for a task sized S is 0. Do it yourself, or say a new size.')
  expect(refused.agentId).toBeUndefined()
  expect(prompts).toEqual([])
  expect((await muka($, 'caps')).text).toMatch(/^Muka caps: hard/)
  // The refusal is listed under the rule's alerts and counted.
  expect((await muka($, 'rules')).text).toMatch(/helpers: Helpers: which, when, how many · checked: 1/)
  // A fork is a clone of its starter: never counted.
  expect((await spawn($, 'fork')).deny).toBeUndefined()
  // The helpers rule off: its caps are off.
  await muka($, 'rule helpers off')
  expect((await spawn($, 'builder')).deny).toBeUndefined()
  // M: the fourth is refused.
  await muka($, 'rule helpers on')
  await $.turn.start({ turnId: 'b', text: 'a medium thing' } as never)
  await sized($, said, 'M')
  for (let i = 0; i < 3; i++) await stop($, (await spawn($, 'builder')).agentId!)
  expect((await spawn($, 'builder')).deny).toContain('the limit for a task sized M is 3')
  // Off again: soft.
  await muka($, 'caps hard off')
  expect((await spawn($, 'builder')).deny).toBeUndefined()
})

test('running at once: 3 under Main and 2 under a helper; soft notes once, hard refuses', async ($, on) => {
  engine(on)
  await start($)
  await muka($, 'rule size off')
  await $.turn.start({ turnId: 'a', text: 'go' } as never)
  for (let i = 0; i < 3; i++) await spawn($, 'builder')
  expect(await notes($)).toEqual([])
  const fourth = await spawn($, 'builder')
  expect(fourth.agentId).toBe('agent-4')
  expect(await notes($)).toEqual(['Muka: 3 helpers already running under Main, the limit is 3. It started, but start no more: wait for one to finish, or reuse one with SendMessage.'])
  await spawn($, 'builder')
  expect(await notes($)).toEqual([])
  // Hard.
  await muka($, 'caps hard on')
  expect((await spawn($, 'builder')).deny).toBe('Muka: 5 helpers already running under Main, the limit is 3. Wait for one to finish, or reuse one with SendMessage.')
  // Under a helper (agent-1): two at a time.
  await spawn($, 'builder', { parentAgentId: 'agent-1' })
  await spawn($, 'builder', { parentAgentId: 'agent-1' })
  expect((await spawn($, 'builder', { parentAgentId: 'agent-1' })).deny).toBe('Muka: 2 helpers already running under this helper, the limit is 2. Wait for one to finish, or reuse one with SendMessage.')
})

test('depth: two levels below the master by default; /muka depth <n|off> changes it and is kept; the submasters rule off lifts it', async ($, on) => {
  engine(on)
  await start($)
  expect((await muka($, 'depth')).text).toBe('Muka depth limit: 2 levels below the master. Use /muka depth <n> (1 or more) or /muka depth off.')
  await $.turn.start({ turnId: 'a', text: 'go' } as never)
  await spawn($, 'builder')
  await spawn($, 'builder', { parentAgentId: 'agent-1' })
  // Level 3 under the default of 2: soft, one note to its starter (agent-2's parent is a helper: a steer note).
  expect((await spawn($, 'builder', { parentAgentId: 'agent-2' })).agentId).toBe('agent-3')
  expect((await muka($, 'caps')).text).toMatch(/Depth: 2 levels below the master/)
  await muka($, 'caps hard on')
  expect((await spawn($, 'builder', { parentAgentId: 'agent-2' })).deny).toBe(
    'Muka: depth limit 2: this helper would sit at level 3. Do the piece yourself; the user can lift the limit with /muka depth <n|off>.',
  )
  // Raised to 3: level 3 passes, level 4 does not.
  expect((await muka($, 'depth 3')).text).toBe('Muka depth limit: helpers may sit 3 levels below the master.')
  expect((await spawn($, 'builder', { parentAgentId: 'agent-2' })).deny).toBeUndefined()
  expect((await spawn($, 'builder', { parentAgentId: 'agent-3' })).deny).toContain('level 4')
  // No limit; the number is kept for the next chat.
  expect((await muka($, 'depth off')).text).toBe('Muka depth limit off: helpers may nest as deep as they like.')
  expect((await spawn($, 'builder', { parentAgentId: 'agent-3' })).deny).toBeUndefined()
  expect((await muka($, 'depth 0')).text).toMatch(/^Muka depth limit: none\. Use \/muka depth/)
  expect((await muka($, 'depth sideways')).text).toMatch(/^Muka depth limit: none\./)
  await muka($, 'depth 1')
  await start($)
  expect((await muka($, 'depth')).text).toMatch(/^Muka depth limit: 1 level below the master/)
  expect((await muka($, 'caps')).text).toMatch(/^Muka caps: hard/)
  // The sub-masters rule off: no depth check.
  await muka($, 'rule submasters off')
  await spawn($, 'builder')
  expect((await spawn($, 'builder', { parentAgentId: 'agent-9' })).deny).toBeUndefined()
  // The helpers hits and the sub-masters hits are counted apart.
  expect((await muka($, 'rules')).text).toMatch(/submasters: Sub-masters/)
  expect((await muka($, 'status')).text).toContain('- Helper caps: hard (refused); depth 1')
})

test('a thin brief brings one note per prompt; a full one brings none', async ($, on) => {
  engine(on)
  await start($)
  await muka($, 'rule size off')
  await $.turn.start({ turnId: 'a', text: 'go' } as never)
  await stop($, (await spawn($, 'builder', { prompt: 'do A' })).agentId!)
  expect(await notes($)).toEqual([THIN_BRIEF_NOTE])
  expect(THIN_BRIEF_NOTE).toBe('Muka: that brief is thin: name the objective, the exact files, what is already known, done-when and the output format.')
  // Once per prompt.
  await stop($, (await spawn($, 'builder', { prompt: 'do B' })).agentId!)
  expect(await notes($)).toEqual([])
  // A new prompt: again, for an Explore under 100 characters; a 100-character one is fine.
  await $.turn.start({ turnId: 'b', text: 'next' } as never)
  await stop($, (await spawn($, 'Explore', { prompt: 'x'.repeat(100) })).agentId!)
  expect(await notes($)).toEqual([])
  await stop($, (await spawn($, 'Explore', { prompt: 'x'.repeat(99) })).agentId!)
  expect(await notes($)).toEqual([THIN_BRIEF_NOTE])
  // A builder brief long enough but with no file-like token.
  await $.turn.start({ turnId: 'c', text: 'next again' } as never)
  await stop($, (await spawn($, 'builder', { prompt: 'Make the mailer send the welcome message when someone signs up, retry three times when it fails, and log every attempt so we can see what happened later. Reply in 150 words.' })).agentId!)
  expect(await notes($)).toEqual([THIN_BRIEF_NOTE])
  // The helpers rule off: nothing said.
  await muka($, 'rule helpers off')
  await $.turn.start({ turnId: 'd', text: 'and again' } as never)
  await stop($, (await spawn($, 'builder', { prompt: 'do C' })).agentId!)
  expect(await notes($)).toEqual([])
})

test('a helper report over 8,000 characters brings a notice and one note to Main per prompt', async ($, on) => {
  engine(on)
  await start($)
  await muka($, 'rule size off')
  await $.turn.start({ turnId: 'a', text: 'go' } as never)
  const { agentId } = await spawn($, 'builder')
  const finish = (answer: string) => $.turn.complete({ answer, durationMs: 10, isAborted: false, turnId: 'a', reason: 'answer', agentId } as never)
  // Exactly 8,000: not long.
  await finish('x'.repeat(LONG_REPORT))
  expect(await notes($)).toEqual([])
  await finish('x'.repeat(LONG_REPORT + 1))
  expect(await notes($)).toEqual([LONG_REPORT_NOTE])
  expect(LONG_REPORT_NOTE).toBe('Muka: ask helpers for reports of at most 150 words; long reports fill your context.')
  // Once per prompt, though the notice keeps coming.
  await finish('x'.repeat(40_000))
  expect(await notes($)).toEqual([])
  expect((await muka($, 'rules')).text).toMatch(/helpers: Helpers: which, when, how many · checked: [2-9]/)
  // The notice names the type and the size (about 10k tokens for 40,000 characters).
  const ui = await $.ui.mount({ plugin: 'muka', component: 'Pane', requestId: 'muka', surface: 'terminal', props: { title: 'Muka', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as never)
  await ui.press({ key: 'tab-notes' })
  expect((await ui.findAll({ type: 'Text', text: /long report from builder: ~2k tokens/ })).length).toBe(1)
  expect((await ui.findAll({ type: 'Text', text: /long report from builder: ~10k tokens/ })).length).toBe(1)
  await ui.unmount()
  // The rule off: nothing.
  await muka($, 'rule helpers off')
  await $.turn.start({ turnId: 'b', text: 'again' } as never)
  await finish('x'.repeat(40_000))
  expect(await notes($)).toEqual([])
})

// ---------------------------------------------------------------------------
// Trim modes.

test('trim auto (the default): over 20,000 always; over the threshold from 40% context, and for a helper; below, whole', async ($, on) => {
  const { files } = engine(on)
  await start($)
  const ctx = (percent: number) => $.session.measure({ context: { tokens: percent * 1000, window: 100_000, percent }, rateLimits: [], changed: ['context'] } as never)
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is auto: a shell result over 20000 characters is trimmed; over 12000 once Main's context is 40% full/)
  await $.turn.start({ turnId: 'a', text: 'go' } as never)
  // Context 10%: 15,000 whole, 25,000 trimmed.
  await ctx(10)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 15_000 } as never)).length).toBeGreaterThanOrEqual(15_000)
  expect(files.size).toBe(0)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 25_000 } as never)).length).toBeLessThan(9_000)
  expect(files.size).toBe(1)
  // 39%: still only the 20,000 rule.
  await ctx(39)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 15_000 } as never)).length).toBeGreaterThanOrEqual(15_000)
  // 40%: the threshold of 12,000; under it, whole.
  await ctx(40)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 15_000 } as never)).length).toBeLessThan(9_000)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 11_000 } as never)).length).toBeGreaterThanOrEqual(11_000)
  // A helper: the threshold whatever Main holds.
  await ctx(5)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 15_000, agentId: 'agent-1' } as never)).length).toBeLessThan(9_000)
  // A custom threshold applies from 40%.
  await muka($, 'trim 14000')
  await ctx(45)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 13_000 } as never)).length).toBeGreaterThanOrEqual(13_000)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 16_000 } as never)).length).toBeLessThan(9_000)
})

test('trim: /muka trim auto|on|off set and keep the mode; a stored boolean migrates; on and off ignore the context', async ($, on) => {
  engine(on, { trim: true })
  await start($)
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is on, over 12000 characters/)
  expect((await muka($, 'trim auto')).text).toMatch(/^Muka output trimming auto: a Bash or PowerShell result over 20000 characters/)
  expect((await muka($, 'status')).text).toContain('- Output trimming: auto: a shell result over 20000 characters is trimmed; over 12000')
  // Kept as the word, for the next chat.
  await start($)
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is auto/)
  await muka($, 'trim off')
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 30_000 } as never)).length).toBeGreaterThanOrEqual(30_000)
  await start($)
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is off, over 12000 characters when on/)
  // On: the threshold at any context.
  await muka($, 'trim on')
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 15_000 } as never)).length).toBeLessThan(9_000)
})

test('trim: a stored false is off and a stored true is on; nothing stored is auto', async ($, on) => {
  engine(on, { trim: false })
  await start($)
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is off/)
})

test('a drop in the cache rate after an effort change is told as "effort changed"', async ($, on) => {
  engine(on)
  let n = 0
  await start($)
  const turn = async (effort: string, usage: Record<string, number | string>) => {
    const id = `t${++n}`
    await $.turn.start({ turnId: id, text: 'go' } as never)
    for await (const chunk of $.turn.step({ turnId: id, index: 0, model: 'opus', messageCount: 1, effort } as never)) void chunk
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer', usage } as never)
  }
  const HIGH = { model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 39_000, cache_creation_input_tokens: 0 }
  const LOW = { model: 'claude-opus-5-5', input_tokens: 36_000, output_tokens: 10, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 }
  await turn('high', HIGH)
  await turn('low', LOW)
  expect((await muka($, 'cache')).text).toContain('Cause: effort changed')
  // The same effort: another cause (unknown).
  await turn('low', HIGH)
  await turn('low', LOW)
  expect((await muka($, 'cache')).text).toContain('Cause: unknown')
})
