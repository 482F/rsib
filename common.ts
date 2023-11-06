import { port } from './const.ts'
import { WsMessage } from './type.ts'

export const apis = {
  exec: ({ scriptName }: { scriptName: string }, wsSender) => {
    wsSender('exec-order', { scriptName })
    return Promise.resolve(new Response(''))
  },
} satisfies {
  [path: string]: (
    // deno-lint-ignore no-explicit-any
    body: any,
    wsSender: <
      TYPE extends WsMessage['type'],
      BODY extends Omit<({ type: TYPE } & WsMessage), 'type'>,
    >(type: TYPE, body: BODY) => void,
  ) => Promise<Response>
}

export async function callApi<
  NAME extends keyof typeof apis,
  BODY extends Parameters<(typeof apis)[NAME]>[0],
>(name: NAME, body: BODY) {
  await fetch(`http://localhost:${port}/api/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function createWsSender(webSockets: Set<WebSocket>) {
  return function wsSender<
    TYPE extends WsMessage['type'],
    BODY extends Omit<({ type: TYPE } & WsMessage), 'type'>,
  >(type: TYPE, body: BODY) {
    webSockets.forEach((ws) => ws.send(JSON.stringify({ ...body, type })))
  }
}
