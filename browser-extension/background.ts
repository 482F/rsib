import { port } from '../const.ts'
import { websocketMessenger } from '../message.ts'
import { Script } from '../type.ts'
import { extensionB2CMessenger, extensionC2BMessenger } from './message.ts'

const scriptMap: Record<string, Script> = {}

export function background(
  uniqueListener: Parameters<typeof extensionC2BMessenger.createListener>[0],
  uniqueSender: Parameters<
    typeof extensionB2CMessenger.createSender<
      { activeTab?: boolean; tabIds?: number[] }
    >
  >[0],
  contextMenuCreator: (
    id: string,
    label: string,
    callback: (el: HtmlElement) => void,
  ) => () => void,
  getActiveTabId: () => Promise<number | undefined>,
) {
  extensionC2BMessenger.createListener(uniqueListener)(
    {
      'get-matched-script-urls': ({ currentUrl }) => {
        return {
          scriptMap: Object.fromEntries(
            Object.entries(
              scriptMap,
            )
              .filter(([, script]) =>
                script.match.some((match) =>
                  new RegExp(match.replaceAll('*', '.*'))
                    .test(
                      currentUrl,
                    )
                )
              ),
          ),
        }
      },
      'create-contextmenus': async ({ menus }) => {
        const tabId = await getActiveTabId()
        if (!tabId) {
          throw new Error('tabId is nullish')
        }
        const unregisterers = menus.map(({ label, id }) =>
          contextMenuCreator(
            id,
            label,
            () => sender('call-contextmenu', { id }, { tabIds: [tabId] }),
          )
        )
        console.log({ unregisterers })
        await new Promise((resolve) => setTimeout(resolve, 10))
        unregisterers.forEach((self) => self())
      },
    },
  )
  const sender = extensionB2CMessenger.createSender(
    uniqueSender,
  )
  websocketMessenger.createListener()({
    'keepalive': () => {},
    'exec-order': (message) => {
      const script = scriptMap[message.scriptName]
      if (!script) {
        return
      }

      sender('exec-order', {
        scriptName: script.name,
      }, { activeTab: true })
    },
    'update-scriptmap': (message) => {
      if (message.isInit) {
        Object.keys(scriptMap).forEach((key) => {
          delete scriptMap[key]
        })
      }

      Object.entries(message.scriptMap).forEach(([name, script]) => {
        if (script) {
          scriptMap[name] = script
        } else {
          delete scriptMap[name]
        }
      })
    },
  })
}
