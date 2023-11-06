export type Message =
  & {
    type: string
  }
  & ({
    type: 'exec-order'
    scriptUrl: string
  })
