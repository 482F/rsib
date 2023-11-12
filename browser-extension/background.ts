import { port } from '../const.ts'
import { websocketMessenger } from '../message.ts'
import { Script } from '../type.ts'
import { extensionMessenger } from './message.ts'

const scriptMap: Record<string, Script> = {}

export function background(
  uniqueSender: Parameters<
    typeof extensionMessenger.createSender<{ activeTab?: boolean }>
  >[0],
) {
  const sender = extensionMessenger.createSender(
    uniqueSender,
  )
  websocketMessenger.createListener()({
    'keepalive': () => {},
    'exec-order': (message) => {
      const script = scriptMap[message.scriptName]
      console.log({ script })
      if (!script) {
        return
      }

      sender('exec-order', {
        scriptUrl:
          `http://localhost:${port}/script/${script.name}#${Date.now()}`,
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
      console.log('updated', { scriptMap })
    },
  })
}
