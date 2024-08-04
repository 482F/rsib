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
  async function insertScript(scriptName: string) {
    console.log('load')
    const main = await importScript(scriptName)
    console.log({ main })
    const api = createRsibApi(scriptName)
    main(api)
  }

  const contextmenus = {}
  async function contextmenu(
    scriptName: string,
  ) {
    const main = await importScript(scriptName)
    const api = createRsibApi(scriptName)

    console.log('addEvent')
    document.addEventListener('contextmenu', async (e) => {
      const menus: { id: string; label: string; func: () => unknown }[] = main({
        ...api,
        e,
      })
      console.log({ menus })
      sender('create-contextmenus', { menus })
      Object.assign(
        contextmenus,
        Object.fromEntries(menus.map(({ id, func }) => [id, func])),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      e.preventDefault()
    })
  }

  extensionB2CMessenger.createListener(uniqueListener)({
    'exec-order': ({ scriptName }) => {
      insertScript(scriptName)
    },
    'call-contextmenu': ({ id }) => {
      console.log({ id, contextmenus })
    },
  })
  const sender = extensionC2BMessenger.createSender(uniqueSender)
  const { scriptMap } = await sender('get-matched-script-urls', {
    currentUrl: location.href,
  })

  const processors = {
    'immediate': insertScript,
    'context-menu': contextmenu,
  } as const

  Object.values(scriptMap).forEach(({ name, runAt }) => {
    Object.entries(processors)
      .filter(([key]) => runAt.includes(key))
      .forEach(([, fn]) => fn(name))
  })
}
