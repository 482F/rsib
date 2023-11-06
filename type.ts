export type WsMessage =
  & { type: string }
  & ({
    type: 'exec-order'
    scriptName: string
  } | {
    type: 'keepalive'
  })
