import { expect, mock, test } from 'claude-code/testing'

import {
  cacheDropCause,
  coreText,
  compactDue,
  compactNote,
  contextCard,
  contextRows,
  ctxFamily,
  efficiencyReport,
  engineMissCause,
  handoffDue,
  handoffNote,
  HANDOFF_MS,
  kTokens,
  newCtxSeen,
  pulseLine,
  serverChanges,
  serverOf,
  trimOutput,
} from './register'
import type { LogEntry } from '../types'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

const MIN = 60_000
const T0 = 1_800_000_000_000
const HOME = 'C:/Users/tester/.claude'
const PLAN = 'mcp__ccd_turn__update_plan'
const PANE = { plugin: 'muka', component: 'Pane', requestId: 'muka', props: { title: 'Muka', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as const

/** n characters or a little more of shell output: numbered rows, an error line twice in the middle, a failure line later. */
const bigOutput = (n: number): string => {
  const lines: string[] = []
  let len = 0
  for (let i = 0; len < n; i++) {
    const line = i === 300 || i === 301 ? 'error: disk full on /dev/sda1' : i === 400 ? 'FAILED test_login (1 failed)' : `row ${String(i).padStart(5, '0')} ok payload payload payload`
    lines.push(line)
    len += line.length + 1
  }
  return lines.join('\n')
}
const count = (text: string, part: string): number => text.split(part).length - 1

// ---------------------------------------------------------------------------
// trimOutput, pure.

test('trimOutput keeps the start, the error lines (deduped) and the end, and says what was cut and where the full text is', () => {
  const text = bigOutput(30_000)
  const out = trimOutput(text, 12_000, 'C:/Users/me/.claude/muka-outputs/output-01.txt')
  expect(out.length).toBeLessThan(9_000)
  expect(out.startsWith('row 00000 ok')).toBe(true)
  expect(out.endsWith(text.slice(-200))).toBe(true)
  expect(count(out, 'error: disk full on /dev/sda1')).toBe(1)
  expect(out).toContain('FAILED test_login (1 failed)')
  expect(out).toMatch(/\[Muka cut \d+ characters \(~\d+k tokens\) from the middle of this output; the full output is in C:\/Users\/me\/\.claude\/muka-outputs\/output-01\.txt\]/)
  // Not saved: it says so, with no path.
  expect(trimOutput(text, 12_000)).toContain('the full output was not saved]')
})

test('trimOutput leaves short text alone, caps the error lines at 60 and never grows the text', () => {
  const short = 'a\nb\nerror: c'
  expect(trimOutput(short, 12_000)).toBe(short)
  expect(trimOutput('x'.repeat(12_000), 12_000)).toBe('x'.repeat(12_000))
  // 200 different error lines in the middle: 60 kept, each clipped.
  const noisy = ['start'.repeat(900), ...Array.from({ length: 200 }, (_, i) => `error ${i} ${'y'.repeat(400)}`), 'end'.repeat(900)].join('\n')
  const out = trimOutput(noisy, 12_000)
  expect(out.split('\n').filter(l => l.startsWith('error ')).length).toBe(60)
  expect(out.split('\n').every(l => l.length <= 4_500)).toBe(true)
  expect(out.length).toBeLessThan(noisy.length)
  // A threshold so small the cut would not shorten it: the text comes back whole.
  const tiny = 'z'.repeat(50)
  expect(trimOutput(tiny, 10)).toBe(tiny)
})

// ---------------------------------------------------------------------------
// Through the engine.

const engine = (on: On, store: Record<string, unknown> = {}) => {
  const files = new Map<string, string>()
  const appended: string[] = []
  const state = { servers: [] as string[] }
  mock.store(on, store)
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester' })
  const clock = mock.clock(on, { now: T0 })
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.append', (_, e, next) => {
    appended.push(String((e as never as { message: { content: { text: string }[] } }).message.content[0]?.text))
    return next(e)
  })
  on('prompt.context', (_, e) => ({ blocks: e.blocks }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('fs.write', (_, e) => {
    files.set(e.path.replace(/\\/g, '/'), e.text)
    return { value: undefined } as never
  })
  on('fs.exists', () => ({ value: false }) as never)
  on('tool.list', () => ({ value: [{ name: 'Bash', description: '', mcp: false }, ...state.servers.map(s => ({ name: `mcp__${s}__go`, description: '', mcp: true }))] }) as never)
  on('tool.call', (_, e) => {
    const c = e as unknown as { tool: string; command?: string; size?: number; background?: boolean }
    const n = c.size ?? 0
    if (c.tool === 'Bash' || c.tool === 'PowerShell') {
      const stdout = bigOutput(n)
      if (c.command === 'fail') return { result: { stdout, stderr: 'boom', interrupted: false }, text: stdout, isError: true } as never
      if (c.background) return { result: { stdout, stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: stdout } as never
      return { result: { stdout, stderr: 'warn: small', interrupted: false }, text: stdout } as never
    }
    const body = 'x'.repeat(n)
    return { result: { content: body }, text: body } as never
  })
  return { files, appended, state, clock }
}

const start = async ($: Engine, cwd = 'C:\\work') => {
  await $.session.start({ cwd, surface: 'terminal', isInteractive: true } as never)
}
const muka = ($: Engine, args: string) => $.command.run({ command: 'muka', args } as never)
const ctxOf = (r: unknown): string[] => (r as { context?: string[] }).context ?? []
const stdoutOf = (r: unknown): string => String((r as { result: { stdout: string } }).result.stdout)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let turns = 0
const HIGH = { model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 39_000, cache_creation_input_tokens: 0 }
const LOW = { model: 'claude-opus-5-5', input_tokens: 36_000, output_tokens: 10, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 }
const finish = async ($: Engine, usage: typeof HIGH | typeof LOW = HIGH, over: Record<string, unknown> = {}) => {
  const id = `u${++turns}`
  await $.turn.start({ turnId: id, text: 'go' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer', usage, ...over } as never)
}

const mount = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => $.ui.mount({ ...PANE, surface } as never)
/** How many lines of the Alerts tab match the text. */
const alertCount = async ($: Engine, text: string): Promise<number> => {
  const ui = await mount($)
  await ui.press({ key: 'tab-notes' })
  const found = await ui.findAll({ type: 'Text', text: new RegExp(esc(text)) })
  await ui.unmount()
  return found.length
}

test('trim off (a stored false): a long shell result reaches the model whole', async ($, on) => {
  const { files } = engine(on, { trim: false })
  await start($)
  const r = await $.tool.call({ tool: 'Bash', command: 'build', size: 30_000 } as never)
  expect(stdoutOf(r).length).toBeGreaterThanOrEqual(30_000)
  expect(files.size).toBe(0)
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is off, over 12000 characters when on/)
})

test('trim on: Bash and PowerShell results over the threshold come back trimmed, the full text saved; the rest is untouched', async ($, on) => {
  const { files } = engine(on)
  await start($)
  expect((await muka($, 'trim on')).text).toMatch(/^Muka output trimming on: a Bash or PowerShell result over 12000 characters/)
  await $.turn.start({ turnId: 'tt', text: 'go' } as never)
  const r = (await $.tool.call({ tool: 'Bash', command: 'build', size: 30_000 } as never)) as { result: { stdout: string; stderr: string; interrupted: boolean }; ref?: number; text?: string }
  // A fresh answer of the tool's own shape: no `ref`, no `text`, the other fields kept.
  expect(r.ref).toBeUndefined()
  expect(r.text).toBeUndefined()
  expect(r.result.stderr).toBe('warn: small')
  expect(r.result.interrupted).toBe(false)
  expect(r.result.stdout.length).toBeLessThan(9_000)
  expect(r.result.stdout).toContain('row 00000')
  expect(count(r.result.stdout, 'error: disk full')).toBe(1)
  expect(r.result.stdout).toContain(`the full output is in ${HOME}/muka-outputs/output-01.txt]`)
  const saved = files.get(`${HOME}/muka-outputs/output-01.txt`)!
  expect(saved.startsWith('# Bash output saved by Muka at ')).toBe(true)
  expect(saved).toContain(bigOutput(30_000))
  // PowerShell, the next file.
  const p = await $.tool.call({ tool: 'PowerShell', command: 'build', size: 30_000 } as never)
  expect(stdoutOf(p).length).toBeLessThan(9_000)
  expect(files.has(`${HOME}/muka-outputs/output-02.txt`)).toBe(true)
  // Under the threshold, Read, Grep, MCP tools and agents: never trimmed.
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'ls', size: 8_000 } as never)).length).toBeGreaterThanOrEqual(8_000)
  for (const tool of ['Read', 'Grep', 'Agent', 'mcp__plugin_x_y__fetch']) {
    const out = (await $.tool.call({ tool, size: 30_000 } as never)) as { result: { content: string }; text: string }
    expect(out.result.content).toHaveLength(30_000)
    expect(out.text).toHaveLength(30_000)
  }
  // A failed command, a command moved to the background: whole.
  const failed = (await $.tool.call({ tool: 'Bash', command: 'fail', size: 30_000 } as never)) as { isError?: boolean }
  expect(failed.isError).toBe(true)
  expect(stdoutOf(failed).length).toBeGreaterThanOrEqual(30_000)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'dev', background: true, size: 30_000 } as never)).length).toBeGreaterThanOrEqual(30_000)
  // Muka still records the step as a normal success: no failure in Alerts, two trims listed.
  expect(await alertCount($, 'trimmed Bash output: ~')).toBe(1)
  expect(await alertCount($, 'trimmed PowerShell output: ~')).toBe(1)
  expect(await alertCount($, 'Bash: fail failed')).toBe(1)
  expect(await alertCount($, 'Bash: build failed')).toBe(0)
})

test('the threshold: /muka trim <chars> sets it (1,000 to 200,000), keeps it, and the files rotate through 30 names', async ($, on) => {
  const { files } = engine(on, { trim: true })
  await start($)
  expect((await muka($, 'trim 40000')).text).toBe('Muka trim threshold: 40000 characters. Output trimming is on.')
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 30_000 } as never)).length).toBeGreaterThanOrEqual(30_000)
  expect(stdoutOf(await $.tool.call({ tool: 'Bash', command: 'a', size: 50_000 } as never)).length).toBeLessThan(9_000)
  expect((await muka($, 'trim 500')).text).toMatch(/^Muka trim threshold: 1000 to 200000 characters \(now 40000\)/)
  expect((await muka($, 'trim sideways')).text).toMatch(/^Use \/muka trim auto/)
  // Kept for the next chat, with the switch.
  await start($)
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is on, over 40000 characters/)
  expect((await muka($, 'trim off')).text).toBe('Muka output trimming off: every result reaches the model whole.')
  // 31 trimmed outputs: the 31st takes the first name again.
  await muka($, 'trim on')
  await muka($, 'trim 1000')
  for (let i = 0; i < 31; i++) await $.tool.call({ tool: 'Bash', command: `c${i}`, size: 2_000 } as never)
  expect([...files.keys()].filter(k => k.includes('muka-outputs')).length).toBeLessThanOrEqual(31)
  expect(files.has(`${HOME}/muka-outputs/output-30.txt`)).toBe(true)
  expect(files.has(`${HOME}/muka-outputs/output-31.txt`)).toBe(false)
})

test('the saved counter feeds the log and the report line "Saved by Muka"; the notice names the tokens', async ($, on) => {
  engine(on, { trim: true })
  await start($)
  await $.turn.start({ turnId: 'rp', text: 'trim a lot' } as never)
  await $.tool.call({ tool: 'Bash', command: 'a', size: 30_000 } as never)
  await $.tool.call({ tool: 'Bash', command: 'b', size: 30_000 } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 'rp', reason: 'answer', usage: { ...HIGH, model: 'claude-sonnet-5-5' } } as never)
  expect(await alertCount($, 'trimmed Bash output: ~')).toBe(2)
  const r = (await muka($, 'report')).text
  expect(r).toMatch(/\*\*Saved by Muka:\*\* ~\d+k tokens kept out by output trimming · 0 nudges · 0 guarded helpers\./)
  // The report line from the log entries alone.
  const entry = (over: Partial<LogEntry>): LogEntry => ({ at: 0, project: 'p', prompt: 'x', durationMs: 1000, mainSteps: 1, agents: 0, failed: 0, files: [], tokens: 100, ...over })
  const rep = efficiencyReport([entry({ trimSavedTokens: 3000, wasteCount: 2, wasteTokens: 100 }), entry({ trimSavedTokens: 2500, guarded: 1 })], 7)
  expect(rep).toContain('**Saved by Muka:** ~6k tokens kept out by output trimming · 2 nudges · 1 guarded helper.')
  expect(efficiencyReport([entry({})], 7)).not.toContain('Saved by Muka')
})

// ---------------------------------------------------------------------------
// The cache cause and the tool list.

test('the cache cause: the engine names none today, so Muka guesses; a named cause would win', async ($, on) => {
  engine(on)
  await start($)
  // Pure: the engine's wording first, then the guesses in their order.
  const none = { gapMs: 0, ttlMin: 60, modelChanged: false, compacted: false, changed: false }
  expect(cacheDropCause({ ...none, engine: 'the system prompt changed' })).toBe('the system prompt changed')
  expect(cacheDropCause({ ...none, modelChanged: true, tools: 'figma' })).toBe('the model changed')
  expect(cacheDropCause({ ...none, tools: 'figma, hex', compacted: true })).toBe('the tool list changed (figma, hex)')
  expect(cacheDropCause(none)).toBe('unknown')
  expect(engineMissCause({ usage: 1 }, { last_miss_cause: ' tools changed ' })).toBe('tools changed')
  expect(engineMissCause({}, undefined, 'x')).toBeUndefined()
  // Through the engine: a drop with no named cause is a guess, and /muka cache says so.
  expect((await muka($, 'cache')).text).toContain('No cache drop seen this chat.')
  await finish($, HIGH)
  await finish($, LOW)
  const text = (await muka($, 'cache')).text
  expect(text).toMatch(/Last drop: 98% to 10% at \d\d:\d\d:\d\d\. Cause: unknown \(Muka's guess: the engine names no cause to plugins\)\./)
  // A cause the engine puts on the turn is used and shown as the engine's.
  await finish($, HIGH)
  await finish($, LOW, { last_miss_cause: 'the system prompt changed' })
  expect(await alertCount($, 'cache dropped 98% → 10%: the system prompt changed')).toBe(1)
  expect((await muka($, 'cache')).text).toContain('Cause: the system prompt changed (named by the engine).')
})

test('a tool server that joins or leaves between turns brings one notice, and is the cause of the next drop', async ($, on) => {
  const { state } = engine(on)
  await start($)
  state.servers = ['plugin_a_x']
  // The first finished turn takes the baseline: servers still connecting do not count.
  await finish($, HIGH)
  state.servers = ['plugin_a_x', 'plugin_b_y']
  await finish($, LOW)
  expect(await alertCount($, 'tool list changed: plugin_b_y (this can reset the cache)')).toBe(1)
  expect(await alertCount($, 'cache dropped 98% → 10%: the tool list changed (plugin_b_y)')).toBe(1)
  // Unchanged: no second notice.
  await finish($, HIGH)
  expect(await alertCount($, 'tool list changed:')).toBe(1)
  // One leaves.
  state.servers = ['plugin_a_x']
  await finish($, HIGH)
  expect(await alertCount($, 'tool list changed: plugin_b_y (this can reset the cache)')).toBe(2)
  expect(serverOf('mcp__plugin_vercel_vercel__list_projects')).toBe('plugin_vercel_vercel')
  expect(serverChanges(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual(['a', 'c'])
})

// ---------------------------------------------------------------------------
// The context breakdown.

test('contextCard: a stacked bar and a row per part, strict XML, honest about what Muka saw', () => {
  const seen = newCtxSeen()
  seen.rules = 8000
  seen.notes = 2000
  seen.tools.read = 40_000
  seen.tools.shell = 8_000
  seen.tools.mcp = 2_000
  const c = contextCard({ ctxTokens: 60_000, ctxWindow: 200_000, ctxPercent: 30 }, seen)
  expect(c.source).toMatch(/^<svg [^>]*viewBox="0 0 400 \d+">[\s\S]*<\/svg>$/)
  expect(c.source).toContain('CONTEXT · WHAT MUKA SAW')
  expect(c.source).toContain('30% · 60k / 200k')
  expect(c.source).toContain('Rules + Muka notes')
  expect(c.source).toContain('>Read results<')
  expect(c.source).toContain('other (system prompt, tools, conversation)')
  expect(c.source).not.toMatch(/="[^"<>]*"[A-Za-z]/)
  expect(c.source).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/)
  expect(c.source).not.toContain('class="rise"')
  expect(c.source).not.toContain('class="tile pop"')
  expect(c.alt).toMatch(/^Context: 30% · 60k \/ 200k\. What Muka saw: Rules \+ Muka notes ~3k, Read results ~10k, Bash \/ PowerShell ~2k, MCP tools ~500; other \(system prompt, tools, conversation\): ~45k\./)
  // No reading yet: the remainder says so.
  expect(contextCard({}, newCtxSeen()).alt).toContain('no reading yet')
  const rows = contextRows({ ctxTokens: 1000 }, seen)
  expect(rows.rest).toBe(0)
  expect(ctxFamily('Read')).toBe('read')
  expect(ctxFamily('PowerShell')).toBe('shell')
  expect(ctxFamily('Glob')).toBe('search')
  expect(ctxFamily('mcp__x__y')).toBe('mcp')
  expect(ctxFamily('Agent')).toBe('agents')
  expect(ctxFamily('WebFetch')).toBe('other')
})

test('/muka context: tool results by kind, rules and notes, the engine total; reset in a new chat and by a compaction', async ($, on) => {
  engine(on)
  await start($)
  await $.prompt.context({ blocks: [] } as never)
  await $.session.measure({ context: { tokens: 60_000, window: 200_000, percent: 30 }, rateLimits: [], changed: ['context'] } as never)
  await $.turn.start({ turnId: 'cx', text: 'go' } as never)
  for (const [tool, size] of [['Read', 40_000], ['Bash', 8_000], ['Grep', 4_000], ['mcp__x__y', 2_000], ['Agent', 1_000], ['WebFetch', 400]] as const) await $.tool.call({ tool, command: 'x', size } as never)
  // A helper's call is not Main's.
  await $.tool.call({ tool: 'Read', size: 100_000, agentId: 'agent-9' } as never)
  const text = (await muka($, 'context')).text
  expect(text).toContain('Muka context: 30% full (60k of 200k tokens, the engine\'s own count).')
  expect(text).toContain('- Read results: ~10k')
  expect(text).toContain('- Bash / PowerShell: ~2k')
  expect(text).toContain('- Grep / Glob: ~1k')
  expect(text).toContain('- MCP tools: ~500')
  expect(text).toContain("- Agents' reports: ~250")
  expect(text).toContain('- Other tools: ~100')
  expect(text).toContain(`- Rules + Muka notes: ~${kTokens(Math.round(coreText().length / 4))}`)
  expect(text).toMatch(/- other \(system prompt, tools, conversation\): ~\d+k/)
  // The view: a card on the desktop, text rows elsewhere.
  const desk = await mount($, 'desktop')
  await desk.press({ key: 'tab-context' })
  expect(String((await desk.findAll({ type: 'Svg' })).at(-1)!.props.alt)).toMatch(/^Context: 30% · 60k \/ 200k\. What Muka saw: .*Read results ~10k/)
  await desk.unmount()
  const ui = await mount($)
  await ui.press({ key: 'tab-context' })
  expect(await ui.find({ type: 'Text', text: '- Read results: ~10k' })).toBeDefined()
  await ui.unmount()
  // A compaction (the fill falls by 25 points) empties the tool results and notes; the rules block stays.
  await $.session.measure({ context: { tokens: 10_000, window: 200_000, percent: 5 }, rateLimits: [], changed: ['context'] } as never)
  const after = (await muka($, 'context')).text
  expect(after).toContain('- Read results: ~0')
  expect(after).toContain(`- Rules + Muka notes: ~${kTokens(Math.round(coreText().length / 4))}`)
  // A new conversation empties it all.
  await $.tool.call({ tool: 'Read', size: 4_000 } as never)
  expect((await muka($, 'context')).text).toContain('- Read results: ~1k')
  await start($)
  const fresh = (await muka($, 'context')).text
  expect(fresh).toContain('- Read results: ~0')
  expect(fresh).toContain('- Rules + Muka notes: ~0')
})

// ---------------------------------------------------------------------------
// Handoff and the compact hint.

test('/muka handoff sends Main the handoff note; the Bridge button does the same', async ($, on) => {
  engine(on)
  await start($, 'C:\\work')
  expect(handoffNote('C:\\work')).toBe(
    'Write a handoff for a fresh chat: goal, what is done, what is left, key decisions, files touched, how to verify, in at most 300 words, to C:/work/.claude/handoff.md; then tell the user to start a new chat and say "continue from .claude/handoff.md".',
  )
  expect(handoffNote()).toContain('in at most 300 words, to .claude/handoff.md;')
  expect((await muka($, 'handoff')).text).toMatch(/^Muka handoff: Main is asked to write \.claude\/handoff\.md/)
  const got = ctxOf(await $.tool.call({ tool: 'Grep', size: 10 } as never))
  expect(got.some(t => t.includes(handoffNote('C:\\work')))).toBe(true)
  // Delivered once.
  expect(ctxOf(await $.tool.call({ tool: 'Grep', size: 10 } as never)).some(t => t.includes('Write a handoff'))).toBe(false)
  // The button on the desktop Bridge.
  const desk = await mount($, 'desktop')
  expect(await desk.find({ type: 'Button', key: 'act-handoff' })).toBeDefined()
  await desk.press({ key: 'act-handoff' })
  expect(ctxOf(await $.tool.call({ tool: 'Grep', size: 10 } as never)).some(t => t.includes(handoffNote('C:\\work')))).toBe(true)
  await desk.unmount()
})

test('a chat past 4 hours of turns or 300 steps brings one handoff suggestion: an Alerts line and the pulse', async ($, on) => {
  engine(on)
  await start($)
  expect(handoffDue({ turnMs: HANDOFF_MS - 1, steps: 299 })).toBeUndefined()
  expect(handoffDue({ turnMs: HANDOFF_MS, steps: 0 })).toBe('240m0s of turns')
  expect(handoffDue({ turnMs: 0, steps: 300 })).toBe('300 steps')
  expect(pulseLine({ handoffHint: true }, [], [], undefined, undefined)).toBe('📝 long chat: /muka handoff for a fresh start')
  expect(pulseLine({}, [], [], undefined, undefined)).toBeUndefined()
  await finish($, HIGH, { durationMs: HANDOFF_MS - 1000 })
  expect(await alertCount($, 'this chat is long')).toBe(0)
  await finish($, HIGH, { durationMs: 2000 })
  // (Alerts show only the last part of a path-like word, so the command is matched as "muka".)
  expect(await alertCount($, 'this chat is long (240m1s of turns): muka handoff writes a handoff')).toBe(1)
  await finish($, HIGH, { durationMs: HANDOFF_MS })
  expect(await alertCount($, 'this chat is long')).toBe(1)
  // Nudges off: no suggestion in a new chat.
  await muka($, 'nudges off')
  await start($)
  await finish($, HIGH, { durationMs: HANDOFF_MS })
  expect(await alertCount($, 'this chat is long')).toBe(1)
})

test('300 steps by Main bring the handoff suggestion at the end of the turn', async ($, on) => {
  engine(on)
  await start($)
  await $.turn.start({ turnId: 'st', text: 'go' } as never)
  for (let i = 0; i < 300; i++) await $.tool.call({ tool: 'Glob', size: 1 } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 'st', reason: 'answer', usage: HIGH } as never)
  expect(await alertCount($, 'this chat is long (300 steps)')).toBe(1)
})

test('a finished plan step on a context over 40% hints /compact once, at most every 20 minutes', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  const hint = (r: unknown, pct: number) => ctxOf(r).some(t => t.includes(compactNote(pct)))
  await $.session.measure({ context: { tokens: 100_000, window: 200_000, percent: 50 }, rateLimits: [], changed: ['context'] } as never)
  await $.tool.call({ tool: PLAN, items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }, { content: 'C', status: 'pending' }, { content: 'D', status: 'pending' }] } as never)
  // Step A done: the hint rides on Main's next result.
  await $.tool.call({ tool: PLAN, advance: true } as never)
  expect(hint(await $.tool.call({ tool: 'Grep', size: 1 } as never), 50)).toBe(true)
  // Step B done a minute later: too soon.
  await clock.set(T0 + MIN)
  await $.tool.call({ tool: PLAN, advance: true } as never)
  expect(hint(await $.tool.call({ tool: 'Grep', size: 1 } as never), 50)).toBe(false)
  // 21 minutes on: again.
  await clock.set(T0 + 22 * MIN)
  await $.tool.call({ tool: PLAN, advance: true } as never)
  expect(hint(await $.tool.call({ tool: 'Grep', size: 1 } as never), 50)).toBe(true)
  expect(await alertCount($, 'plan step done at 50% context: told to compact')).toBe(2)
  // The rule of thumb, pure.
  const a = [{ content: 'A', status: 'in_progress' as const }]
  const b = [{ content: 'A', status: 'completed' as const }]
  expect(compactDue(a, b, 41, 30 * MIN, 0)).toBe(true)
  expect(compactDue(a, b, 40, 30 * MIN, 0)).toBe(false)
  expect(compactDue(a, b, undefined, 30 * MIN, 0)).toBe(false)
  expect(compactDue(a, a, 80, 30 * MIN, 0)).toBe(false)
  expect(compactDue(a, b, 80, 10 * MIN, 0)).toBe(false)
})

test('a plan step finished under 40% context, or with nudges and the context rule off, brings no hint', async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure({ context: { tokens: 60_000, window: 200_000, percent: 30 }, rateLimits: [], changed: ['context'] } as never)
  await $.tool.call({ tool: PLAN, items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }] } as never)
  await $.tool.call({ tool: PLAN, advance: true } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', size: 1 } as never)).some(t => t.includes('plan step just finished'))).toBe(false)
  await $.session.measure({ context: { tokens: 120_000, window: 200_000, percent: 60 }, rateLimits: [], changed: ['context'] } as never)
  await muka($, 'nudges off')
  await muka($, 'rule context off')
  await $.tool.call({ tool: PLAN, items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }] } as never)
  await $.tool.call({ tool: PLAN, advance: true } as never)
  expect(ctxOf(await $.tool.call({ tool: 'Grep', size: 1 } as never)).some(t => t.includes('plan step just finished'))).toBe(false)
})

// ---------------------------------------------------------------------------
// The Menu and the status text.

test('/muka lists the new commands; /muka menu opens the tab', async ($, on) => {
  engine(on)
  await start($)
  const status = (await muka($, '')).text
  for (const part of ['/muka trim on', '/muka trim <chars>', '/muka context', '/muka handoff', '/muka compact', '/muka menu']) expect(status).toContain(part)
  expect(status).toContain('- Output trimming: auto: a shell result over 20000 characters is trimmed; over 12000')
  const ui = await mount($)
  expect((await muka($, 'menu')).text).toMatch(/^Muka menu:/)
  expect(await ui.find({ type: 'Text', text: 'Switches' })).toBeDefined()
  await ui.unmount()
})

test('the Menu: every command has a button; toggles show their state and flip; the tab comes right after the Bridge', async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($)
  const tabs = (await ui.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith('tab-')).map(b => b.props.key)
  expect(tabs.slice(0, 2)).toEqual(['tab-flow', 'tab-menu'])
  await ui.press({ key: 'tab-menu' })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.props.key)).filter(k => k.startsWith('menu-'))
  expect(new Set(keys).size).toBe(keys.length)
  for (const k of [
    'rules', 'nudges', 'models', 'guard', 'pings', 'motion', 'trim', 'caps-hard', 'depth', 'budget',
    'view-rules', 'view-context', 'view-report', 'view-alerts', 'view-changes', 'view-activity',
    'wrap', 'stop', 'verify', 'handoff', 'compact',
    'info-status', 'info-cache', 'info-caps', 'info-audit', 'info-recap-today', 'info-recap-yesterday', 'info-rules',
    'rea-status', 'rea-setup', 'rea-doctor', 'setup', 'setup-undo',
  ]) expect(keys).toContain(`menu-${k}`)
  for (const h of ['Switches', 'Views', 'Actions', 'Info', 'Tools']) expect(await ui.find({ type: 'Text', text: h })).toBeDefined()
  // Toggles: primary when on, the state in the label, one press flips.
  const state = async (k: string) => {
    const b = (await ui.find({ type: 'Button', key: `menu-${k}` }))!
    return `${String(b.props.label).replace(/^\S+ /, '')}|${String(b.props.variant)}`
  }
  // Trim cycles auto, on, off, auto.
  expect(await state('trim')).toBe('Trim: auto|primary')
  await ui.press({ key: 'menu-trim' })
  expect(await state('trim')).toBe('Trim: on|primary')
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is on/)
  await ui.press({ key: 'menu-trim' })
  expect(await state('trim')).toBe('Trim: off|secondary')
  await ui.press({ key: 'menu-trim' })
  expect(await state('trim')).toBe('Trim: auto|primary')
  // Hard caps toggle; depth cycles 2, 3, no limit, 2.
  expect(await state('caps-hard')).toBe('Hard caps: off|secondary')
  await ui.press({ key: 'menu-caps-hard' })
  expect(await state('caps-hard')).toBe('Hard caps: on|primary')
  expect((await muka($, 'caps')).text).toMatch(/^Muka caps: hard/)
  await ui.press({ key: 'menu-caps-hard' })
  expect(await state('caps-hard')).toBe('Hard caps: off|secondary')
  expect(await state('depth')).toBe('Depth: 2|primary')
  await ui.press({ key: 'menu-depth' })
  expect(await state('depth')).toBe('Depth: 3|primary')
  await ui.press({ key: 'menu-depth' })
  expect(await state('depth')).toBe('Depth: no limit|secondary')
  expect((await muka($, 'depth')).text).toMatch(/^Muka depth limit: none/)
  await ui.press({ key: 'menu-depth' })
  expect(await state('depth')).toBe('Depth: 2|primary')
  await ui.press({ key: 'menu-info-caps' })
  expect(String((await ui.find({ type: 'Markdown' }))!.props.text)).toContain('Muka caps: soft')
  expect(await state('nudges')).toBe('Nudges: on|primary')
  await ui.press({ key: 'menu-nudges' })
  expect(await state('nudges')).toBe('Nudges: off|secondary')
  expect(await state('rules')).toBe('Panel rules: on|primary')
  await ui.press({ key: 'menu-rules' })
  expect(await state('rules')).toBe('Panel rules: off|secondary')
  expect(await state('guard')).toBe('Delete guard: off|secondary')
  await ui.press({ key: 'menu-guard' })
  expect(await state('guard')).toBe('Delete guard: on|primary')
  // The budget cycles off, 2, 5, 10, off.
  const budget = async () => String((await ui.find({ type: 'Button', key: 'menu-budget' }))!.props.label)
  expect(await budget()).toBe('💲 Budget cycle: off')
  await ui.press({ key: 'menu-budget' })
  expect(await budget()).toBe('💲 Budget cycle: $2')
  await ui.press({ key: 'menu-budget' })
  expect(await budget()).toBe('💲 Budget cycle: $5')
  // A view button opens the view.
  await ui.press({ key: 'menu-view-context' })
  expect(await ui.find({ type: 'Text', text: /^Context: what filled Main's context/ })).toBeDefined()
  await ui.unmount()
})

test('the Menu: an info button prints into the result area; Clear empties it', async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($)
  await ui.press({ key: 'tab-menu' })
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  await ui.press({ key: 'menu-info-cache' })
  const md = (await ui.find({ type: 'Markdown' }))!
  expect(String(md.props.text)).toContain('Muka cache: no turn yet, so no cache clock.')
  expect(await ui.find({ type: 'Button', key: 'menu-clear' })).toBeDefined()
  await ui.press({ key: 'menu-info-status' })
  expect(String((await ui.find({ type: 'Markdown' }))!.props.text)).toContain('- Output trimming: auto')
  await ui.press({ key: 'menu-info-rules' })
  expect(String((await ui.find({ type: 'Markdown' }))!.props.text)).toMatch(/^Muka rules \(on\)/)
  await ui.press({ key: 'menu-handoff' })
  expect(String((await ui.find({ type: 'Markdown' }))!.props.text)).toContain('Muka handoff: Main is asked')
  expect(ctxOf(await $.tool.call({ tool: 'Grep', size: 1 } as never)).some(t => t.includes('Write a handoff for a fresh chat'))).toBe(true)
  await ui.press({ key: 'menu-clear' })
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  await ui.unmount()
})

test('the Menu: Setup undo needs a second press within 10 seconds, and the label goes back after that', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  const ui = await mount($)
  await ui.press({ key: 'tab-menu' })
  const label = async () => String((await ui.find({ type: 'Button', key: 'menu-setup-undo' }))!.props.label)
  expect(await label()).toBe('Setup undo')
  await ui.press({ key: 'menu-setup-undo' })
  expect(await label()).toBe('Press again to confirm')
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  // Too late: the label is back, and a press only asks again.
  await clock.advance(10_001)
  expect(await label()).toBe('Setup undo')
  await ui.press({ key: 'menu-setup-undo' })
  expect(await label()).toBe('Press again to confirm')
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  // In time: it runs and prints.
  await clock.advance(5_000)
  await ui.press({ key: 'menu-setup-undo' })
  expect(String((await ui.find({ type: 'Markdown' }))!.props.text)).toContain('Muka setup undo: there is no setup to undo.')
  expect(await label()).toBe('Setup undo')
  // REA setup asks the same way (it would start a download), and another button in between cancels nothing but keeps its own key.
  await ui.press({ key: 'menu-rea-setup' })
  expect(String((await ui.find({ type: 'Button', key: 'menu-rea-setup' }))!.props.label)).toBe('Press again to confirm')
  expect(await label()).toBe('Setup undo')
  await ui.unmount()
})

test('the Bridge rows carry the Trim toggle and the Handoff action', async ($, on) => {
  engine(on)
  await start($)
  const desk = await mount($, 'desktop')
  const trim = async () => (await desk.find({ type: 'Button', key: 'ctl-trim' }))!.props
  expect(String((await trim()).label)).toBe('✂️ Trim: auto')
  await desk.press({ key: 'ctl-trim' })
  expect(String((await trim()).label)).toBe('✂️ Trim: on')
  expect((await trim()).variant).toBe('primary')
  expect((await muka($, 'trim')).text).toMatch(/^Muka output trimming is on/)
  await desk.press({ key: 'ctl-trim' })
  expect(String((await trim()).label)).toBe('✂️ Trim: off')
  expect((await trim()).variant).toBe('secondary')
  await desk.press({ key: 'ctl-trim' })
  expect(String((await trim()).label)).toBe('✂️ Trim: auto')
  await desk.unmount()
})
