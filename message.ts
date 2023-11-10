import { port } from './const.ts'
import { Script } from './type.ts'

export function messengerCreator<
  MessageUnion extends {
    type: string
    request?: Record<string, unknown>
    response?: Record<string, unknown>
  },
>() {
  type MessageByType<Type extends MessageUnion['type']> =
    & { type: Type }
    & MessageUnion
  type Handlers = {
    [type in MessageUnion['type']]: (
      request: MessageByType<type>['request'],
    ) => MessageByType<type>['response']
  }
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
        Message extends ({ type: Type } & MessageUnion),
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
        listener: (rawMessage: string) => MessageUnion['response'],
      ) => void,
    ) {
      return function listener(
        handlers: Handlers,
      ) {
        rawListener((rawMessage) => {
          const message = JSON.parse(rawMessage)
          const handler = handlers[message.type as MessageUnion['type']]
          return handler(message.request)
        })
      }
    },
    createHandler(handlers: Handlers) {
      return function handler<
        Type extends MessageUnion['type'],
      >(
        type: string,
        message: string,
      ) {
        return handlers[type as Type](JSON.parse(message).request)
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
  createHandler(
    rawHandlers: Parameters<typeof _apiMessenger.createHandler>[0],
  ) {
    const handler = _apiMessenger.createHandler(rawHandlers)
    return (type: string, request: string) => {
      const result = handler(type, request)
      return new Response(JSON.stringify(result || null))
    }
  },
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
