import { port } from '../const.ts'
import { extensionB2CMessenger, extensionC2BMessenger } from './message.ts'

function insertScript(scriptUrl: string) {
  const script = document.createElement('script')
  script.src = scriptUrl
  document.head.appendChild(script)
}

export async function content(
  uniqueListener: Parameters<typeof extensionB2CMessenger.createListener>[0],
  uniqueSender: Parameters<typeof extensionC2BMessenger.createSender>[0],
) {
  extensionB2CMessenger.createListener(uniqueListener)({
    'exec-order': ({ scriptUrl }) => {
      insertScript(scriptUrl)
    },
  })
  const sender = extensionC2BMessenger.createSender(uniqueSender)
  const { scriptMap } = await sender('get-matched-script-urls', {
    currentUrl: location.href,
  })

  Object.values(scriptMap).forEach(({ name }) => {
    insertScript(`http://localhost:${port}/script/${name}#${Date.now()}`)
  })
}
