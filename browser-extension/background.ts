/// <reference types="https://unpkg.com/chrome-types@0.1.153/index.d.ts" />

import { port } from '../const.ts'
import { websocketMessenger } from '../message.ts'
import { Script } from '../type.ts'
import { Message } from './ext-type.ts'

function sendMessage(tabId: number, message: Message) {
  chrome.tabs.sendMessage(tabId, JSON.stringify(message))
}

const scriptMap: Record<string, Script> = {}

export function background() {
  websocketMessenger.createListener()({
    'keepalive': () => {},
    'exec-order': async (message) => {
      const windowId = await chrome.windows.getLastFocused().then((win) =>
        win.id
      )
      if (!windowId) {
        return
      }

      const [tab] = await chrome.tabs.query({ active: true, windowId })
      if (!tab?.id) {
        return
      }

      const script = scriptMap[message.scriptName]
      if (!script) {
        return
      }

      sendMessage(tab.id, {
        type: 'exec-order',
        scriptUrl:
          `http://localhost:${port}/script/${script.name}#${Date.now()}`,
      })
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
