import { Message } from './ext-type.ts'

const handlers = {
  'exec-order': (message) => {
    const script = document.createElement('script')
    script.src = message.scriptUrl
    document.head.appendChild(script)
  },
} satisfies {
  [name in Message['type']]: (message: Message & { type: name }) => void
}

export function listen(
  listener: (handler: (message: Message) => void) => void,
) {
  listener((message: Message) => {
    handlers[message.type](message as any)
  })
}
