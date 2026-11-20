import { expect, mock, test } from 'claude-code/testing'

import { mergeMukaSettings, MUKA_CORE, MUKA_LARGE, MUKA_RULES } from './register'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Body>[1]

/** An engine with a fake home folder: files live in a map, nothing touches the disk. */
const engine = (on: On, files: Map<string, string>, store: Record<string, unknown> = {}) => {
  mock.store(on, store)
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester' })
  mock.clock(on)
  const appended: string[] = []
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.append', (_, e, next) => {
    appended.push(String((e as never as { message: { content: { text: string }[] } }).message.content[0]?.text))
    return next(e)
  })
  on('prompt.context', (_, e) => ({ blocks: e.blocks }) as never)
  // The plugin's own extras are found by their place under extras/, wherever the root is.
  const norm = (p: string) => p.replace(/\\/g, '/')
  const shipped = (raw: string) => {
    const p = norm(raw)
    if (p.endsWith('/extras/settings.json')) return JSON.stringify({ env: { MUKA_TEST: '1' }, model: 'sonnet', askUserQuestionTimeout: '60s', autoCompactWindow: 200000 })
    if (p.endsWith('/extras/statusline.js')) return '// status line'
    if (p.endsWith('/extras/skills/verify/SKILL.md')) return '---\nname: verify\n---\nprove it ran'
    const m = p.match(/\/extras\/agents\/(.+\.md)$/)
    return m ? `---\nname: ${m[1]!.replace('.md', '')}\n---\nnew` : undefined
  }
  on('fs.read', (_, e) => {
    const text = shipped(e.path) ?? files.get(norm(e.path))
    if (text === undefined) throw new Error(`no such file: ${e.path}`)
    return { value: text } as never
  })
  on('fs.exists', (_, e) => ({ value: shipped(e.path) !== undefined || files.has(norm(e.path)) }) as never)
  on('fs.list', (_, e) =>
    ({ value: norm(e.path).endsWith('/extras/agents') ? ['builder.md', 'Explore.md'].map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) : [] }) as never,
  )
  on('fs.write', (_, e) => {
    files.set(norm(e.path), e.text)
    return { value: undefined } as never
  })
  return appended
}

const HOME = 'C:/Users/tester/.claude'

test('settings merge: env key by key, Muka keys replaced, plugins and marketplaces added without overriding yours', () => {
  const cur = { model: 'opus', env: { FOO: '1' }, enabledPlugins: { x: true, z: false }, extraKnownMarketplaces: { m: {} }, theme: 'dark' }
  const add = { model: 'sonnet', env: { MUKA_TEST: '1' }, enabledPlugins: { y: true, z: true }, extraKnownMarketplaces: { g: { a: 1 } } }
  expect(mergeMukaSettings(cur, add)).toEqual({
    model: 'sonnet',
    env: { FOO: '1', MUKA_TEST: '1' },
    enabledPlugins: { x: true, y: true, z: false },
    extraKnownMarketplaces: { m: {}, g: { a: 1 } },
    theme: 'dark',
  })
})

test('/muka setup installs the agents, the verify skill, status line and settings, backs up what it replaces, and undo puts it back', async ($, on) => {
  const files = new Map<string, string>([
    [`${HOME}/settings.json`, JSON.stringify({ model: 'opus', env: { FOO: '1' }, enabledPlugins: { x: true } })],
    [`${HOME}/agents/builder.md`, 'my old builder'],
    [`${HOME}/skills/verify/SKILL.md`, 'my old verify skill'],
  ])
  engine(on, files)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  const r = await $.command.run({ command: 'muka', args: 'setup' } as never)
  expect(r.text).toMatch(/^Muka setup done:\n- agent: builder\n- agent: Explore\n- skill: verify\n- status line script\n- settings: env, model, askUserQuestionTimeout, autoCompactWindow/)
  expect(r.text).toContain('autoCompactWindow 200000 was added: the conversation auto-compacts at 200,000 tokens (your own value is never replaced).')
  expect(files.get(`${HOME}/agents/builder.md`)).toMatch(/name: builder\n---\nnew/)
  expect(files.get(`${HOME}/skills/verify/SKILL.md`)).toBe('---\nname: verify\n---\nprove it ran')
  expect(files.get(`${HOME}/statusline.js`)).toBe('// status line')
  expect(JSON.parse(files.get(`${HOME}/settings.json`)!)).toEqual({ model: 'sonnet', env: { FOO: '1', MUKA_TEST: '1' }, enabledPlugins: { x: true }, askUserQuestionTimeout: '60s', autoCompactWindow: 200000 })
  // What it replaced is kept under backups.
  const saved = [...files.keys()].filter(k => k.startsWith(`${HOME}/backups/muka-setup-2`))
  expect(saved.map(k => k.replace(/.*muka-setup-[^/]+\//, '')).sort()).toEqual(['agents/builder.md', 'settings.json', 'skills/verify/SKILL.md'])

  // Again: nothing to change.
  const again = await $.command.run({ command: 'muka', args: 'setup' } as never)
  expect(again.text).toMatch(/agent: builder \(already up to date\)[\s\S]*skill: verify \(already up to date\)[\s\S]*settings \(already up to date\)/)

  // The second setup changed nothing, so undo still puts back what the first replaced.
  const undo = await $.command.run({ command: 'muka', args: 'setup undo' } as never)
  expect(undo.text).toMatch(/^Muka setup undone\. Put back: agents\/builder\.md, verify\/SKILL\.md, \.claude\/settings\.json\./)
  expect(files.get(`${HOME}/agents/builder.md`)).toBe('my old builder')
  expect(files.get(`${HOME}/skills/verify/SKILL.md`)).toBe('my old verify skill')
})

test('settings merge: autoCompactWindow is added only when yours has none, and never replaces yours', () => {
  expect(mergeMukaSettings({ model: 'opus' }, { autoCompactWindow: 200000 })).toEqual({ model: 'opus', autoCompactWindow: 200000 })
  expect(mergeMukaSettings({ autoCompactWindow: 350000 }, { autoCompactWindow: 200000, model: 'sonnet' })).toEqual({ autoCompactWindow: 350000, model: 'sonnet' })
  // A value of 0 or null is still yours.
  expect(mergeMukaSettings({ autoCompactWindow: null }, { autoCompactWindow: 200000 })).toEqual({ autoCompactWindow: null })
})

test('/muka setup keeps your own autoCompactWindow, says so, and undo puts the settings back', async ($, on) => {
  const files = new Map<string, string>([[`${HOME}/settings.json`, JSON.stringify({ model: 'opus', autoCompactWindow: 350000 })]])
  engine(on, files)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  const r = await $.command.run({ command: 'muka', args: 'setup' } as never)
  expect(r.text).toContain('Your autoCompactWindow (350000) was kept.')
  expect(r.text).not.toContain('was added')
  expect(JSON.parse(files.get(`${HOME}/settings.json`)!).autoCompactWindow).toBe(350000)
  await $.command.run({ command: 'muka', args: 'setup undo' } as never)
  expect(JSON.parse(files.get(`${HOME}/settings.json`)!)).toEqual({ model: 'opus', autoCompactWindow: 350000 })
})

test('/muka setup adds autoCompactWindow when yours has none; undo takes it out again', async ($, on) => {
  const files = new Map<string, string>([[`${HOME}/settings.json`, JSON.stringify({ model: 'opus' })]])
  engine(on, files)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  const r = await $.command.run({ command: 'muka', args: 'setup' } as never)
  expect(r.text).toContain('autoCompactWindow 200000 was added')
  expect(JSON.parse(files.get(`${HOME}/settings.json`)!).autoCompactWindow).toBe(200000)
  await $.command.run({ command: 'muka', args: 'setup undo' } as never)
  expect(JSON.parse(files.get(`${HOME}/settings.json`)!)).toEqual({ model: 'opus' })
})

test('/muka setup undo restores what the last setup replaced', async ($, on) => {
  const files = new Map<string, string>([
    [`${HOME}/settings.json`, JSON.stringify({ model: 'opus' })],
    [`${HOME}/agents/builder.md`, 'my old builder'],
  ])
  engine(on, files)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ command: 'muka', args: 'setup' } as never)
  const u = await $.command.run({ command: 'muka', args: 'setup undo' } as never)
  expect(u.text).toMatch(/^Muka setup undone\. Put back: agents\/builder\.md, \.claude\/settings\.json\.\nLeft in place \(they were new, so there was nothing to put back\): agents\/Explore\.md, verify\/SKILL\.md, \.claude\/statusline\.js\./)
  expect(files.get(`${HOME}/agents/builder.md`)).toBe('my old builder')
  expect(JSON.parse(files.get(`${HOME}/settings.json`)!)).toEqual({ model: 'opus' })
  expect((await $.command.run({ command: 'muka', args: 'setup undo' } as never)).text).toMatch(/already undone/)
})

test('/muka setup changes nothing when settings.json is not valid JSON', async ($, on) => {
  const files = new Map<string, string>([[`${HOME}/settings.json`, '{ broken']])
  engine(on, files)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  const r = await $.command.run({ command: 'muka', args: 'setup' } as never)
  expect(r.text).toMatch(/could not be read as JSON, so nothing was changed/)
  expect([...files.keys()]).toEqual([`${HOME}/settings.json`])
})

test('smart: the rules join each new conversation while on; switching tells the current chat at once', async ($, on) => {
  const appended = engine(on, new Map())
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  // On by default: the rules ride in the context, framed as the user's.
  const withRules = (await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'today' }] } as never)) as { blocks: { name: string; text: string }[] }
  expect(withRules.blocks.map(b => b.name)).toEqual(['currentDate', 'mukaRules'])
  // The core: the large-task details are left for a prompt that looks large.
  expect(withRules.blocks[1]!.text).toBe(MUKA_CORE)
  expect(MUKA_CORE.length).toBeLessThan(MUKA_RULES.length - 400)
  expect(MUKA_CORE).toMatch(/## Large tasks\n\nFor an L task/)
  expect(MUKA_LARGE).toMatch(/^## Large tasks: plan, then swarm[\s\S]*Keep PLAN\.md current/)
  expect(MUKA_RULES).toMatch(/^These are the user's coordination rules, added by Muka/)
  expect(MUKA_RULES).toMatch(/## Size every task first/)

  const off = await $.command.run({ command: 'muka', args: 'smart off' } as never)
  expect(off.text).toMatch(/^Muka smart off/)
  expect(appended.at(-1)).toMatch(/^Muka smart is now off/)
  const without = (await $.prompt.context({ blocks: [] } as never)) as { blocks: unknown[] }
  expect(without.blocks).toEqual([])
  // The same setting again sends no second note.
  await $.command.run({ command: 'muka', args: 'smart off' } as never)
  expect(appended).toHaveLength(1)

  const back = await $.command.run({ command: 'muka', args: 'smart' } as never)
  expect(back.text).toMatch(/^Muka smart on/)
  expect(appended.at(-1)).toMatch(/^Muka smart is now on\. From now on, follow these coordination rules:\n\nThese are the user's/)

  // /muka all off: panel and rules together; the status says so.
  const all = await $.command.run({ command: 'muka', args: 'all off' } as never)
  expect(all.text).toMatch(/^Muka off: the panel and the smart rules\./)
  const status = await $.command.run({ command: 'muka', args: 'status' } as never)
  expect(status.text).toMatch(/- Panel: off .*\n- Smart rules: off /)
})

test('setup takes back the Haiku helper default an earlier Muka setup put in, and keeps a model you chose', () => {
  expect(mergeMukaSettings({ env: { CLAUDE_CODE_SUBAGENT_MODEL: 'haiku', FOO: '1' } }, { model: 'sonnet' })).toEqual({ env: { FOO: '1' }, model: 'sonnet' })
  expect(mergeMukaSettings({ env: { CLAUDE_CODE_SUBAGENT_MODEL: 'haiku' } }, {})).toEqual({})
  expect(mergeMukaSettings({ env: { CLAUDE_CODE_SUBAGENT_MODEL: 'opus' } }, {})).toEqual({ env: { CLAUDE_CODE_SUBAGENT_MODEL: 'opus' } })
})
