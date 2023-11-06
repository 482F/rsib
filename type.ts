export type WsMessage =
  & { type: string }
  & ({
    type: 'exec-order'
    scriptName: string
  } | {
    type: 'keepalive'
  })

export type Script = {
  name: string
  path: string
  body: string
  match?: string
  'run-at'?: string
}
