import { expect, test } from 'claude-code/testing'

import { filesByHelperCard, helperFileRows, mukaScore, scoreCard, scoreGrade, toolRows, toolsCard } from './register'
import type { ActivityItem, FileChange, MainInfo, SubAgent } from '../types'

const usage = (cacheRead: number, input: number) => ({ input, output: 10, cacheRead, cacheWrite: 0 })
const helper = (over: Partial<SubAgent>): SubAgent => ({ id: 'a', type: 'builder', description: 'd', model: 'sonnet', status: 'done', startedAt: 0, steps: [], stepCount: 1, ...over })
const step = (over: Partial<ActivityItem>): ActivityItem => ({ tool: 'Read', label: 'x', at: 1, agent: 'Main', ...over })

test('the score weighs the four pillars 30/30/20/20', () => {
  const info: MainInfo = { usage: usage(80, 20), ctxPercent: 40 }
  const r = mukaScore({ info, list: [helper({})], feed: [step({})] })
  expect(r.pillars.map(p => [p.key, p.value])).toEqual([['cache', 80], ['reliability', 100], ['models', 100], ['context', 60]])
  // 80*.3 + 100*.3 + 100*.2 + 60*.2 = 86
  expect(r.score).toBe(86)
  expect(r.grade).toBe('A')
})

test('a pillar with no reading is left out and the others are weighted up', () => {
  // Only cache (50) and context headroom (50): both 50.
  const r = mukaScore({ info: { usage: usage(50, 50), ctxPercent: 50 }, list: [], feed: [] })
  expect(r.pillars.find(p => p.key === 'reliability')!.value).toBeUndefined()
  expect(r.pillars.find(p => p.key === 'models')!.value).toBeUndefined()
  expect(r.score).toBe(50)
  // Cache 100 alone gives 100.
  expect(mukaScore({ info: { usage: usage(10, 0) }, list: [], feed: [] }).score).toBe(100)
})

test('no reading at all: no score and no grade', () => {
  const r = mukaScore({ info: {}, list: [], feed: [] })
  expect(r.score).toBeUndefined()
  expect(r.grade).toBeUndefined()
  expect(r.pillars).toHaveLength(4)
  const c = scoreCard(r)
  expect(c.alt).toContain('no reading yet')
  expect(c.source).toContain('—')
})

test('grade edges', () => {
  expect([100, 95, 94, 90, 89, 80, 79, 65, 64, 0].map(scoreGrade)).toEqual(['S+', 'S+', 'S', 'S', 'A', 'A', 'B', 'B', 'C', 'C'])
})

test('reliability counts failed and stopped helpers and error steps; denied steps do not count', () => {
  const r = mukaScore({
    info: {},
    list: [helper({ status: 'failed' }), helper({ id: 'b', status: 'stopped' }), helper({ id: 'c' }), helper({ id: 'd', status: 'running' })],
    feed: [step({ outcome: 'error' }), step({ outcome: 'denied' }), step({}), step({})],
  })
  // 3 bad of 8
  expect(r.pillars.find(p => p.key === 'reliability')!.value).toBe(62.5)
})

test('model discipline: unnamed models and an Explore on opus or fable cost points', () => {
  const r = mukaScore({
    info: {},
    list: [helper({ picked: true }), helper({ id: 'b', picked: false }), helper({ id: 'c', type: 'Explore', model: 'opus' }), helper({ id: 'd', type: 'Explore', model: 'haiku' })],
    feed: [],
  })
  expect(r.pillars.find(p => p.key === 'models')!.value).toBe(50)
})

test('the score card is SVG with the number, the grade and a bar per pillar', () => {
  const r = mukaScore({ info: { usage: usage(90, 10), ctxPercent: 10 }, list: [], feed: [] })
  const c = scoreCard(r)
  expect(c.source).toContain('MUKA SCORE')
  expect(c.source).toContain(`>${r.grade}<`)
  expect(c.alt).toMatch(/^Muka Score: \d+ of 100, grade /)
})

test('tool rows: the most used first, errors in red, who used them', () => {
  const feed = [step({ tool: 'Read' }), step({ tool: 'Read', agent: 'builder' }), step({ tool: 'Bash', outcome: 'error' }), step({ tool: 'Read' }), step({ tool: 'Grep' })]
  const rows = toolRows(feed)
  expect(rows.map(r => r.label)).toEqual(['Read', 'Bash', 'Grep'])
  expect(rows[0]!.text).toBe('3× · Main, bui…')
  expect(rows[1]!.text).toBe('1× · 1 err · Main')
  expect(rows[1]!.hue).not.toBe(rows[0]!.hue)
  expect(toolRows(Array.from({ length: 30 }, (_, i) => step({ tool: `T${i}` })))).toHaveLength(10)
  expect(toolsCard(feed).alt).toContain('this prompt only')
  expect(toolsCard([]).alt).toContain('No steps yet')
})

test('files by helper counts each file once per agent', () => {
  const files: FileChange[] = [
    { path: 'a.ts', agents: ['builder', 'Main'], count: 3, at: 1 },
    { path: 'b.ts', agents: ['builder'], count: 1, at: 2 },
    { path: 'c.ts', agents: ['Main', 'Main'], count: 1, at: 3 },
  ]
  const rows = helperFileRows(files)
  expect(rows.map(r => [r.label, r.value, r.text])).toEqual([['🔨 builder', 2, '2 files'], ['🧠 Main', 2, '2 files']])
  expect(filesByHelperCard([]).alt).toContain('No files changed yet')
})
