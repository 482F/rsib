import { port } from '../const.ts'
import { Script } from '../type.ts'
import { extensionB2CMessenger, extensionC2BMessenger } from './message.ts'

const host = `http://localhost:${port}`

const createRsibApi = (scriptName: string) => {
  return {
    load<T>(requireName: string) {
      return import(
        `${host}/require/${scriptName}?name=${requireName}&t=${Date.now()}`
      ) as T
    },
  }
}

export type RsibApi = ReturnType<typeof createRsibApi>

async function insertScript(scriptName: string) {
  const scriptUrl = `${host}/script/${scriptName}#${Date.now()}`
  const api = createRsibApi(scriptName)
  const main = await import(scriptUrl).then((m) => m.default)
  if (!main) {
    console.error(`'${scriptName}' does not export default function`)
    return
  }
  console.log(`${scriptName}`)
  main(api)
}

export async function content(
  uniqueListener: Parameters<typeof extensionB2CMessenger.createListener>[0],
  uniqueSender: Parameters<typeof extensionC2BMessenger.createSender>[0],
) {
  extensionB2CMessenger.createListener(uniqueListener)({
    'exec-order': ({ scriptName }) => {
      insertScript(scriptName)
    },
  })
  const sender = extensionC2BMessenger.createSender(uniqueSender)
  const { scriptMap } = await sender('get-matched-script-urls', {
    currentUrl: location.href,
  })

  Object.values(scriptMap).forEach(({ name }) => {
    insertScript(name)
  })
}
