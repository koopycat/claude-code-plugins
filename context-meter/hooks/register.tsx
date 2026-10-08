import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Meter } from '../types'

const meter = atom({ plugin: 'context-meter', key: 'meter' } as const, null)

const MAX_BAR = 20
const MIN_BAR = 5

// claude-opus-5-5 -> Opus 5.5. Provider prefixes (us.anthropic.), dates and
// version tags (-20250514, @20250805, -v1:0) are dropped, a [1m] tag is kept,
// and anything else (aliases, other naming schemes) is shown as is.
export const modelLabel = (id: string): string => {
  const tag = /\[[^\]]*\]$/.exec(id)?.[0] ?? ''
  const bare = id.slice(0, id.length - tag.length)
  const match = /(?:^|[./])claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?=$|[-@:])/.exec(bare)
  if (!match) return id
  const [, family = '', major, minor] = match
  const version = minor === undefined ? major : `${major}.${minor}`
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version}${tag}`
}

const compact = (value: number, unit: string) =>
  `${value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, '')}${unit}`

// Units are picked after rounding, so 999,600 reads 1M, never 1000k.
export const tokenLabel = (n: number): string =>
  n >= 999_500 ? compact(n / 1_000_000, 'M') : n >= 1_000 ? compact(n / 1_000, 'k') : String(n)

const fillColor = (percent: number) =>
  percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success'

const record = ($: EngineInterface, model: string, { context, cost }: Pick<SessionUsage, 'context' | 'cost'>) =>
  update($, meter, () => ({
    model,
    tokens: context.tokens,
    window: context.window,
    percent: context.percent,
    usd: cost?.usd,
  }))

const refresh = async ($: EngineInterface) => {
  const [model, usage] = await Promise.all([$.session.model(), $.session.usage()])
  await record($, model, usage)
}

// The widest row that fits: the bar shrinks to MIN_BAR, then the cost and
// then the token counts are left out; past that the row is cut at its end.
const layout = (m: Meter, columns: number) => {
  const model = modelLabel(m.model)
  const percent = m.percent === undefined ? '' : ` ${m.percent}%`
  const tokens = ` ${m.tokens === undefined ? '–' : tokenLabel(m.tokens)} / ${tokenLabel(m.window)}`
  const cost = m.usd === undefined ? '' : ` · $${m.usd.toFixed(2)}`
  const fixed = `${model} · `.length + percent.length

  for (const extra of [tokens + cost, tokens, '']) {
    const bar = Math.min(MAX_BAR, columns - fixed - extra.length)
    if (bar >= MIN_BAR) return { model, bar, percent, extra }
  }
  return { model, bar: MIN_BAR, percent, extra: '' }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($)
    return started
  })

  // Pushed after every turn and whenever context, cost or rate limits move;
  // the figures ride on the event, only the model is read.
  on('session.measure', async ($, e, next) => {
    await record($, await $.session.model(), e)
    return next(e)
  })

  // /model, /compact and /clear change the figures without a turn. A failed
  // refresh must never change what the command did.
  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  // Each tool call follows a model response, so the fill keeps up during
  // long tool loops instead of jumping at the end of the turn.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meter)
    if (e.props.hasSurvey || m === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const { model, bar, percent, extra } = layout(m, e.props.bodyColumns)
    const fill = Math.max(0, Math.min(100, m.percent ?? 0))
    // Any fill shows at least one cell, so a short bar never reads empty beside 5%.
    const filled = fill > 0 ? Math.max(1, Math.round((fill / 100) * bar)) : 0

    // One line of spans: a Text keeps no key and a fragment lays out as a column.
    return (
      <Box key="meter">
        <Text wrap="truncate-end">
          <Text color="claude" bold>
            {model}
          </Text>
          <Text dimColor> · </Text>
          <Text color={fillColor(fill)}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(bar - filled)}</Text>
          {percent === '' ? null : <Text color={fillColor(fill)}>{percent}</Text>}
          <Text dimColor>{extra}</Text>
        </Text>
      </Box>
    )
  })
}
