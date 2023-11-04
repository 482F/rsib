/// <reference types="https://unpkg.com/chrome-types@0.1.153/index.d.ts" />

import { port } from '../const.ts'
import { WsMessage } from '../type.ts'
import { Message } from './ext-type.ts'

function listenWs(handler: (message: WsMessage) => void) {
  const connect = () => {
    const websocket = new WebSocket(`ws://localhost:${port}/`)
    console.log('connect')
    websocket.onmessage = (e) => {
      const message = (() => {
        try {
          return JSON.parse(e.data)
        } catch (_e) {
          return
        }
      })()

      handler(message)
    }
    websocket.onclose = connect
    return websocket
  }
  return connect()
}

function sendMessage(tabId: number, message: Message) {
  chrome.tabs.sendMessage(tabId, JSON.stringify(message))
}

const handlers = {
  'exec-order': async (message) => {
    const windowId = await chrome.windows.getLastFocused().then((win) => win.id)
    if (!windowId) {
      return
    }

    const [tab] = await chrome.tabs.query({ active: true, windowId })
    console.log({ tab })
    if (!tab?.id) {
      return
    }

    sendMessage(tab.id, {
      ...message,
      scriptUrl:
        `http://localhost:55923/script/user-script/get-lyrics.ts.bundled.js#${Date.now()}`,
    })
  },
  'keepalive': () => {},
} satisfies {
  [name in WsMessage['type']]: (message: WsMessage & { type: name }) => void
}

export function background() {
  listenWs((message) => {
    handlers[message.type](message as any)
  })
}
