import { expect, mock, test } from 'claude-code/testing'

import { applyPlan, headerCard, planProgress, progressLine } from './register'

const PANE = {
  plugin: 'muka',
  component: 'Pane',
  requestId: 'muka',
  props: { title: 'Savvy', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const PLAN = 'mcp__ccd_turn__update_plan'

test('the task list follows update_plan, TodoWrite and wrap_up', () => {
  let plan = applyPlan(undefined, PLAN, {
    items: [
      { content: 'Read the code', status: 'in_progress' },
      { content: 'Change it', status: 'pending' },
      { content: 'Test it', status: 'pending' },
    ],
  })
  expect(progressLine(plan)).toBe('0/3 · Read the code')
  plan = applyPlan(plan, PLAN, { advance: true })
  expect(progressLine(plan)).toBe('1/3 · Change it')
  plan = applyPlan(plan, PLAN, { done: [2], start: 3 })
  expect(progressLine(plan)).toBe('2/3 · Test it')
  plan = applyPlan(plan, 'mcp__ccd_turn__wrap_up', { recap: 'x' })
  expect(progressLine(plan)).toBe('3/3 · all done')
  // Other tools leave it alone; an empty list stays empty.
  expect(applyPlan(plan, 'Read', {})).toBeUndefined()
  expect(applyPlan(undefined, PLAN, { advance: true })).toBeUndefined()
  // TodoWrite, the terminal's checklist.
  const todo = applyPlan(undefined, 'TodoWrite', { todos: [{ content: 'A', status: 'completed', activeForm: 'Doing A' }, { content: 'B', status: 'in_progress', activeForm: 'Doing B' }] })
  expect(planProgress(todo)).toEqual({ done: 1, total: 2, current: 'B' })
  expect(progressLine(undefined)).toBeUndefined()
})

test('the desktop header card draws progress and the four bars', () => {
  const card = headerCard(
    { model: 'claude-sonnet-5-5', costUsd: 1.5, ctxPercent: 41, plan: [{ content: 'Build', status: 'completed' }, { content: 'Test', status: 'in_progress' }] },
    [],
  )
  expect(card.source.startsWith('<svg')).toBe(true)
  expect(card.source.endsWith('</svg>')).toBe(true)
  expect(card.alt).toMatch(/progress 1 of 2 steps, now: Test/)
  expect(card.alt).toMatch(/context 41%/)
  expect(card.alt).toMatch(/\$1\.50 this session/)
})

test('the panel shows the progress bar as the task list moves', async ($, on) => {
  mock.store(on)
  mock.env(on, {})
  mock.clock(on)
  on('session.surfaces', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: { command: 'muka' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }) as never)
  await $.session.start({ cwd: 'C:\\work', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ turnId: 't-0', text: 'build it' } as never)
  await $.tool.call({ tool: PLAN, items: [{ content: 'Plan', status: 'in_progress' }, { content: 'Build', status: 'pending' }, { content: 'Ship', status: 'pending' }, { content: 'Check', status: 'pending' }] } as never)
  await $.tool.call({ tool: PLAN, advance: true } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Progress\s+█{2,3}░+ 1\/4 · Build$/ })).toBeDefined()
  await ui.unmount()
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(String((await desk.findAll({ type: 'Svg' }))[0]?.props.alt)).toMatch(/progress 1 of 4 steps, now: Build/)
  await desk.unmount()
})
