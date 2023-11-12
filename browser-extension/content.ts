import { extensionMessenger } from './message.ts'

export function listen(
  rawListener: Parameters<typeof extensionMessenger.createListener>[0],
) {
  extensionMessenger.createListener(rawListener)({
    'exec-order': ({ scriptUrl }) => {
      const script = document.createElement('script')
      script.src = scriptUrl
      document.head.appendChild(script)
    },
  })
}
