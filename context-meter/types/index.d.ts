export type Meter = {
  model: string
  tokens?: number
  window: number
  percent?: number
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { meter: Meter | null }
  }
}
