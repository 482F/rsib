import { port } from './const.ts'
import { Script } from './type.ts'

export function messengerCreator<
  MessageUnion extends {
    type: string
    request?: Record<string, unknown>
  },
>() {
  return {
    createSender<Option extends Record<string, unknown>>(
      rawSender: (rawMessage: string, option?: Option) => void,
    ) {
      return function sender<
        Type extends MessageUnion['type'],
        Message extends ({ type: Type } & MessageUnion),
      >(
        type: Type,
        request: Message['request'],
        option?: Option,
      ): void {
        const rawMessage = JSON.stringify({ type, request })
        rawSender(rawMessage, option)
      }
    },
    createListener(
      rawListener: (listener: (rawMessage: string) => void) => void,
    ) {
      return function listener(
        handlers: {
          [type in MessageUnion['type']]: (
            request: ({ type: type } & MessageUnion)['request'],
          ) => void
        },
      ) {
        rawListener((rawMessage) => {
          const message = JSON.parse(rawMessage)
          const handler = handlers[message.type as MessageUnion['type']]
          handler(message.request)
        })
      }
    },
  }
}

const _websocketMessenger = messengerCreator<
  ({
    type: 'keepalive'
  } | {
    type: 'exec-order'
    request: {
      scriptName: string
    }
  } | {
    type: 'update-scriptmap'
    request: {
      scriptMap: Record<string, Script | null>
      isInit: boolean
    }
  })
>()

export const websocketMessenger = {
  createSender(webSockets: Iterable<WebSocket>) {
    return _websocketMessenger.createSender<{ targets?: Iterable<WebSocket> }>(
      (rawMessage, { targets } = {}) => {
        ;[...(targets ?? webSockets)].forEach((ws) => ws.send(rawMessage))
      },
    )
  },
  createListener() {
    return _websocketMessenger.createListener((listener) => {
      const connect = () => {
        const websocket = new WebSocket(`ws://localhost:${port}/`)
        console.log('connect')
        websocket.onmessage = (e) => {
          listener(e.data)
        }
        websocket.onclose = connect
      }
      connect()
    })
  },
}
