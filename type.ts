export type WsMessage =
  & { type: string }
  & ({
    type: 'keepalive'
  } | {
    type: 'exec-order'
    scriptName: string
  } | {
    type: 'update-scriptmap'
    scriptMap: Record<string, Script | null>
  })

export type Script = {
  name: string
  path: string
  dist?: string
  match?: string
  runAt?: string
}
