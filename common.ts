import { port } from './const.ts'
import { websocketMessenger } from './message.ts'
import { Script } from './type.ts'

export const apis = {
  exec: ({ scriptName }: { scriptName: string }, { wsSender }) => {
    wsSender('exec-order', { scriptName })
    return Promise.resolve('')
  },
  list: (_: unknown, { scriptMap }) => {
    return Promise.resolve(scriptMap)
  },
} satisfies {
  [path: string]: (
    // deno-lint-ignore no-explicit-any
    body: any,
    opts: {
      wsSender: ReturnType<typeof websocketMessenger.createSender>
      scriptMap: { [k: string]: Script }
    },
  ) => Promise<any>
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

function _parseUsComment(body: string) {
  return [...body.matchAll(/==UserScript==[\s\S]+==\/UserScript==/g)]
    .flatMap((match) =>
      [...(match[0] ?? '').matchAll(
        /^\/\/\!?\s+\@(?<key>\S+)\s+(?<value>.+)$/mg,
      )].map((
        rawEntry,
      ) => [rawEntry.groups?.key ?? '', rawEntry.groups?.value ?? ''])
    )
}
export function parseUSComment(body: string, ancestors: string[]) {
  return Object.fromEntries([...ancestors, body].flatMap(_parseUsComment))
}

export function isNonNullish<T>(val: T): val is T & Record<string, unknown> {
  return val !== null && val !== undefined
}
