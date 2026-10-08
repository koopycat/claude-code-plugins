import { describe, expect, test } from 'claude-code/testing'
import type { On, SessionContextUsage, SessionCost } from 'claude-code'

import { modelLabel, tokenLabel } from '../hooks/register'

const SURFACES = ['terminal', 'desktop'] as const

const band = (bodyColumns: number, hasSurvey = false) =>
  ({
    plugin: 'context-meter',
    component: 'AbovePrompt',
    props: {
      hasSurvey,
      isWorking: false,
      maxRows: 10,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  }) as const

const CONTEXT = { tokens: 87_400, window: 200_000, percent: 44 }

// A slash command as the person types it at the prompt.
const typed = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as const

// Stands in for the engine: what $.session.model() and $.session.usage() answer.
const engine = (on: On, model: string, context: SessionContextUsage, cost?: SessionCost) => {
  on('session.model', () => ({ value: model }))
  on('session.usage', () => ({ value: { startedAt: 0, context, rateLimits: [], cost } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
}

describe('labels', () => {
  test('model ids', async () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelLabel('claude-haiku-4-5')).toBe('Haiku 4.5')
    expect(modelLabel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
    expect(modelLabel('claude-opus-4-1-20250805')).toBe('Opus 4.1')
    expect(modelLabel('claude-opus-4-1@20250805')).toBe('Opus 4.1')
    expect(modelLabel('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('Sonnet 4.5')
    expect(modelLabel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5[1m]')
    expect(modelLabel('opusplan')).toBe('opusplan')
  })

  test('token counts round before picking a unit', async () => {
    expect(tokenLabel(950)).toBe('950')
    expect(tokenLabel(1_000)).toBe('1k')
    expect(tokenLabel(87_400)).toBe('87.4k')
    expect(tokenLabel(99_960)).toBe('100k')
    expect(tokenLabel(200_000)).toBe('200k')
    expect(tokenLabel(999_600)).toBe('1M')
    expect(tokenLabel(1_500_000)).toBe('1.5M')
  })
})

describe('band', () => {
  test('draws the figures the measurement carries', async ($, on) => {
    // usage() answers other figures: the hook must read the event's.
    engine(on, 'claude-opus-5-5', { tokens: 1, window: 200_000, percent: 0 })
    await $.session.measure({ context: CONTEXT, rateLimits: [], cost: { usd: 1.234 }, changed: ['context'] })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...band(100), surface })
      expect((await ui.find({ key: 'meter' }))?.text).toBe(
        'Opus 5.5 · █████████░░░░░░░░░░░ 44% 87.4k / 200k · $1.23',
      )
      await ui.unmount()
    }
  })

  test('fits narrow bands by shrinking the bar, then dropping cost and tokens', async ($, on) => {
    engine(on, 'claude-opus-5-5', CONTEXT, { usd: 1.234 })
    await $.session.measure({ context: CONTEXT, rateLimits: [], cost: { usd: 1.234 }, changed: ['context'] })

    const rows: Record<number, string> = {
      50: 'Opus 5.5 · ██████░░░░░░░░ 44% 87.4k / 200k · $1.23',
      40: 'Opus 5.5 · █████░░░░░░░ 44% 87.4k / 200k',
      25: 'Opus 5.5 · ████░░░░░░ 44%',
    }
    for (const [columns, row] of Object.entries(rows)) {
      const ui = await $.ui.mount({ ...band(Number(columns)), surface: 'terminal' })
      const text = (await ui.find({ key: 'meter' }))?.text
      expect(text).toBe(row)
      expect(text?.length).toBe(Number(columns))
      await ui.unmount()
    }

    for (let columns = 20; columns <= 120; columns += 1) {
      const ui = await $.ui.mount({ ...band(columns), surface: 'terminal' })
      expect((await ui.find({ key: 'meter' }))?.text.length).toBeLessThanOrEqual(columns)
      await ui.unmount()
    }
  })

  test('never draws an empty bar beside a fill above 0%', async ($, on) => {
    const context = { tokens: 48_700, window: 1_000_000, percent: 5 }
    engine(on, 'claude-sonnet-5-5', context)
    await $.session.measure({ context, rateLimits: [], changed: ['context'] })

    const ui = await $.ui.mount({ ...band(26), surface: 'terminal' })
    expect((await ui.find({ key: 'meter' }))?.text).toBe('Sonnet 5.5 · █░░░░░░░░░ 5%')
    await ui.unmount()
  })

  test('shows missing figures once, without a percentage', async ($, on) => {
    const context = { window: 200_000 }
    engine(on, 'claude-opus-5-5', context)
    await $.session.measure({ context, rateLimits: [], changed: ['context'] })

    const ui = await $.ui.mount({ ...band(100), surface: 'terminal' })
    expect((await ui.find({ key: 'meter' }))?.text).toBe('Opus 5.5 · ░░░░░░░░░░░░░░░░░░░░ – / 200k')
    await ui.unmount()
  })

  test('colors the fill by threshold and survives a fill past 100%', async ($, on) => {
    const cases: [number, string][] = [
      [59, 'success'],
      [60, 'warning'],
      [84, 'warning'],
      [85, 'error'],
      [120, 'error'],
    ]
    engine(on, 'claude-opus-5-5', CONTEXT)
    for (const [percent, color] of cases) {
      const context = { ...CONTEXT, percent }
      await $.session.measure({ context, rateLimits: [], changed: ['context'] })
      const ui = await $.ui.mount({ ...band(100), surface: 'terminal' })
      const shown = await ui.find({ type: 'Text', text: /^ \d+%$/ })
      expect(shown?.text).toBe(` ${percent}%`)
      expect(shown?.props.color).toBe(color)
      await ui.unmount()
    }
  })

  test('yields to a survey', async ($, on) => {
    engine(on, 'claude-opus-5-5', CONTEXT)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine" />
    })
    await $.session.measure({ context: CONTEXT, rateLimits: [], changed: ['context'] })

    const ui = await $.ui.mount({ ...band(100, true), surface: 'terminal' })
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    expect(await ui.find({ key: 'meter' })).toBeUndefined()
    await ui.unmount()
  })

  test('leaves the band to the engine before the first measurement', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine" />
    })

    const ui = await $.ui.mount({ ...band(100), surface: 'terminal' })
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    expect(await ui.find({ key: 'meter' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('refresh', () => {
  test('after a slash command, such as /model', async ($, on) => {
    let model = 'claude-opus-5-5'
    on('session.model', () => ({ value: model }))
    on('session.usage', () => ({ value: { startedAt: 0, context: CONTEXT, rateLimits: [] } }))
    on('command.run', () => {
      model = 'claude-haiku-5-5'
      return { text: 'Set model to Haiku 5.5' }
    })

    await $.command.run(typed('model', 'haiku'))

    const ui = await $.ui.mount({ ...band(100), surface: 'terminal' })
    expect((await ui.find({ key: 'meter' }))?.text).toMatch(/^Haiku 5\.5 · /)
    await ui.unmount()
  })

  test('after each tool call, so the fill moves during a turn', async ($, on) => {
    let context = CONTEXT
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.usage', () => ({ value: { startedAt: 0, context, rateLimits: [] } }))
    on('tool.call', () => ({ deny: 'not run in tests' }))

    await $.tool.call({ tool: 'Bash', command: 'true' })
    context = { tokens: 150_000, window: 200_000, percent: 75 }
    await $.tool.call({ tool: 'Bash', command: 'true' })

    const ui = await $.ui.mount({ ...band(100), surface: 'terminal' })
    expect((await ui.find({ key: 'meter' }))?.text).toContain(' 75% 150k / 200k')
    await ui.unmount()
  })

  test('a failed refresh never changes what a command did', async ($, on) => {
    on('session.model', () => {
      throw new Error('model unavailable')
    })
    on('command.run', () => ({ text: 'ran' }))

    const ran = await $.command.run(typed('compact', ''))
    expect(ran).toMatchObject({ text: 'ran' })
  })
})
