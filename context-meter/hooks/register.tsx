import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Meter } from '../types'

const meter = atom({ plugin: 'context-meter', key: 'meter' } as const, null)

const BAR_CELLS = 20

// claude-opus-5-5 -> Opus 5.5; anything else (aliases, third-party ids) as is.
export const modelLabel = (id: string): string => {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)(.*)$/.exec(id)
  if (!match) return id
  const [, family = '', major, minor, rest] = match
  return `${family[0]?.toUpperCase()}${family.slice(1)} ${major}.${minor}${rest}`
}

export const tokenLabel = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`
      : String(n)

const fillColor = (percent: number) =>
  percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success'

const refresh = async ($: EngineInterface) => {
  const [model, usage] = await Promise.all([$.session.model(), $.session.usage()])
  const next: Meter = {
    model,
    tokens: usage.context.tokens,
    window: usage.context.window,
    percent: usage.context.percent,
    usd: usage.cost?.usd,
  }
  await update($, meter, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($)
    return started
  })

  // Pushed after every turn and whenever context, cost or rate limits move.
  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  // /model and /compact change the figures without a turn.
  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meter)
    if (e.props.hasSurvey || m === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const percent = m.percent ?? 0
    const filled = Math.round((percent / 100) * BAR_CELLS)

    const used = m.tokens === undefined ? '–' : tokenLabel(m.tokens)
    const cost = m.usd === undefined ? '' : ` · $${m.usd.toFixed(2)}`

    // One line of spans: a Text keeps no key and a fragment lays out as a column.
    return (
      <Box key="meter">
        <Text>
          <Text color="claude" bold>
            {modelLabel(m.model)}
          </Text>
          <Text dimColor> · </Text>
          <Text color={fillColor(percent)}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(BAR_CELLS - filled)}</Text>
          <Text color={fillColor(percent)}>
            {m.percent === undefined ? ' –' : ` ${m.percent}%`}
          </Text>
          <Text dimColor>{` ${used} / ${tokenLabel(m.window)}${cost}`}</Text>
        </Text>
      </Box>
    )
  })
}
