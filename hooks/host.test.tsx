import { expect, mock, test } from 'claude-code/testing'

import { GUARD_DENY } from './register'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Body>[1]

// The desktop app's session: the engine calls it non-interactive and lists no
// surface, as seen in the real app (the guard said "no one to ask").
const host = (on: On, entrypoint: string | undefined) => {
  const asked: string[] = []
  mock.store(on, { guard: true })
  mock.env(on, entrypoint ? { CLAUDE_CODE_ENTRYPOINT: entrypoint } : {})
  mock.clock(on)
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'savvy' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 72, mtimeMs: 0, isLink: false } }) as never)
  on('tool.call', (_, e) => {
    const call = e as unknown as { tool: string; questions?: { question: string }[] }
    if (call.tool === 'AskUserQuestion') {
      asked.push(call.questions?.[0]?.question ?? '')
      return { result: { questions: call.questions, answers: { [call.questions![0]!.question]: 'Block it' } } } as never
    }
    return { result: {} } as never
  })
  return asked
}

for (const entrypoint of ['claude-desktop', 'claude-vscode']) {
  test(`the guard asks in ${entrypoint}, which reports no prompt and no surface`, async ($, on) => {
    const asked = host(on, entrypoint)
    await $.session.start({ cwd: 'C:\\proj', surface: null, isInteractive: false } as never)
    const ran = (await $.tool.call({ tool: 'Bash', command: 'rm block-me.txt' } as never)) as { deny?: string }
    expect(asked).toHaveLength(1)
    expect(ran.deny?.startsWith(GUARD_DENY)).toBe(true)
  })
}

for (const entrypoint of ['sdk-cli', undefined]) {
  test(`a headless run (${entrypoint ?? 'no entrypoint'}) is not asked`, async ($, on) => {
    const asked = host(on, entrypoint)
    await $.session.start({ cwd: 'C:\\proj', surface: null, isInteractive: false } as never)
    expect(await $.tool.call({ tool: 'Bash', command: 'rm block-me.txt' } as never)).toMatchObject({ result: {} })
    expect(asked).toHaveLength(0)
  })
}
