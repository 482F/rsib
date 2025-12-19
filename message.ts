import { isNonNullish } from './common.ts'
import { port } from './const.ts'
import { Script } from './type.ts'

type Listener<T extends string, R> = {
  (type: T, rawMessage: string): R
  (rawMessage: string): R
}

export function messengerCreator<
  MessageUnion extends {
    type: string
    request?: Record<string, unknown>
    response?: Record<string, unknown>
  },
>() {
  type Promisable<T> = Promise<T> | T

  type MessageByType<Type extends MessageUnion['type']> =
    & { type: Type }
    & MessageUnion
  return {
    createSender<Option extends Record<string, unknown>>(
      rawSender: (
        type: string,
        rawMessage: string,
        option?: Option,
      ) => Promise<string | void> | string | void,
    ) {
      return async function sender<
        Type extends MessageUnion['type'],
        Message extends { type: Type } & MessageUnion =
          & { type: Type }
          & MessageUnion,
      >(
        type: Type,
        request: Message['request'],
        option?: Option,
      ): Promise<Message['response']> {
        const rawMessage = JSON.stringify({ type, request })
        return JSON.parse(await rawSender(type, rawMessage, option) ?? 'null')
      }
    },
    createListener(
      rawListener: (
        listener:
          & ((
            type: MessageUnion['type'],
            rawMessage: string,
          ) => Promisable<MessageUnion['response']>)
          & ((rawMessage: string) => Promisable<MessageUnion['response']>),
      ) => void,
    ) {
      return function listener(
        handlers: {
          [type in MessageUnion['type']]: (
            request: MessageByType<type>['request'],
          ) => Promisable<MessageByType<type>['response']>
        },
      ) {
        rawListener(
          (
            typeOrRawMessage: MessageUnion['type'] | string,
            rawMessageOrUndefined?: string | undefined,
          ) => {
            const [type, request] = (() => {
              if (isNonNullish(rawMessageOrUndefined)) {
                const message = JSON.parse(rawMessageOrUndefined)
                return [typeOrRawMessage, message.request]
              } else {
                const message = JSON.parse(typeOrRawMessage)
                return [message.type, message.request]
              }
            })()
            return handlers[type as MessageUnion['type']](request)
          },
        )
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
      (_type, rawMessage, { targets } = {}) => {
        ;[...(targets ?? webSockets)].forEach((ws) => ws.send(rawMessage))
      },
    )
  },
  createListener() {
    return _websocketMessenger.createListener((listener) => {
      const connect = () => {
        const websocket = new WebSocket(`ws://localhost:${port}/`)
        websocket.onmessage = (e) => {
          listener(e.data)
        }
        websocket.onclose = connect
      }
      connect()
    })
  },
}

const _apiMessenger = messengerCreator<
  {
    type: 'exec'
    request: { scriptName: string }
  } | {
    type: 'list'
    response: { scriptMap: Record<string, Script> }
  }
>()

export const apiMessenger = {
  createListener: _apiMessenger.createListener,
  createSender() {
    return _apiMessenger.createSender(async (type, rawMessage) => {
      const r = await fetch(`http://localhost:${port}/api/${type}`, {
        method: 'POST',
        body: rawMessage,
      })
      return await r.json()
    })
  },
}
