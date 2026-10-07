import { expect, test } from 'claude-code/testing'

import { modelLabel, tokenLabel } from '../hooks/register'

const BAND = {
  plugin: 'context-meter',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const CONTEXT = { tokens: 87_400, window: 200_000, percent: 44 }

test('labels models and token counts', async () => {
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5[1m]')
  expect(modelLabel('opusplan')).toBe('opusplan')
  expect(tokenLabel(87_400)).toBe('87.4k')
  expect(tokenLabel(200_000)).toBe('200k')
  expect(tokenLabel(1_000_000)).toBe('1M')
})

test('draws model, fill and cost after a measurement', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: CONTEXT, rateLimits: [], cost: { usd: 1.234 } },
  }))
  on('session.measure', ($, e) => ({ changed: e.changed }))

  await $.session.measure({ context: CONTEXT, rateLimits: [], cost: { usd: 1.234 }, changed: ['context'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ key: 'meter' }))?.text).toBe(
      'Opus 5.5 · █████████░░░░░░░░░░░ 44% 87.4k / 200k · $1.23',
    )
    await ui.unmount()
  }
})

test('leaves the band to the engine before the first measurement', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'engine' })).toBeDefined()
  expect(await ui.find({ key: 'meter' })).toBeUndefined()
  await ui.unmount()
})
