import { port } from '../const.ts'
import { extensionB2CMessenger, extensionC2BMessenger } from './message.ts'

const host = `http://localhost:${port}`

const createRsibApi = (
  scriptName: string,
  sender: ReturnType<typeof extensionC2BMessenger.createSender>,
) => {
  return {
    load<T>(requireName: string) {
      return import(
        `${host}/require/${scriptName}?name=${requireName}&t=${Date.now()}`
      ) as T
    },
    async fetch(
      url: string,
      options?: {
        method: string
        headers: Record<string, string>
        body:
          | Record<string, unknown>
          | Blob
          | FormData
          | string
      },
    ) {
      const [requestBody, bodyType] = await (async () => {
        if (options?.body instanceof Blob) {
          return [
            await options.body.stream().getReader().read().then((r) =>
              r.value ? [...r.value] : undefined
            ),
            'blob',
          ] as const
        } else if (options?.body instanceof FormData) {
          return [
            [...options.body.entries()].map((
              [key, value],
            ) => [key, value.toString()] as const),
            'formData',
          ] as const
        } else if (typeof options?.body === 'string') {
          return [options?.body, 'string'] as const
        } else {
          return [JSON.stringify(options?.body), 'string'] as const
        }
      })()
      const rawResponse = await sender('fetch', {
        url,
        method: options?.method ?? 'GET',
        headers: options?.headers ?? {},
        bodyType,
        body: requestBody,
      })
      const responseBody = rawResponse.body
        ? Uint8Array.from(rawResponse.body, (n) => n)
        : undefined
      return new Response(responseBody)
    },
  }
}

export type RsibApi = ReturnType<typeof createRsibApi>

export async function content(
  uniqueListener: Parameters<typeof extensionB2CMessenger.createListener>[0],
  uniqueSender: Parameters<typeof extensionC2BMessenger.createSender>[0],
) {
  async function importScript(scriptName: string) {
    const scriptUrl = `${host}/script/${scriptName}#${Date.now()}`
    const main = await import(scriptUrl).then((m) => m.default)
    if (!main) {
      console.error(`'${scriptName}' does not export default function`)
      return
    }
    console.log(`${scriptName}`)

    return main
  }
  const sender = extensionC2BMessenger.createSender(uniqueSender)
  async function insertScript(scriptName: string) {
    console.log('load')
    const main = await importScript(scriptName)
    console.log({ main })
    const api = createRsibApi(scriptName, sender)
    main(api)
  }

  extensionB2CMessenger.createListener(uniqueListener)({
    'exec-order': ({ scriptName }) => {
      insertScript(scriptName)
    },
  })
  const { scriptMap } = await sender('get-matched-script-urls', {
    currentUrl: location.href,
  })

  Object.values(scriptMap).forEach(({ name }) => {
    insertScript(name)
  })
}
