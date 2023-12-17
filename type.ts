export type Script = {
  name: string
  path: string
  dist?: string
  match: string[]
  runAt: string[]
  require: string[]
  sourceMap?: string
}

export type { RsibApi } from './browser-extension/content.ts'
