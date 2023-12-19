/// <reference types="https://unpkg.com/chrome-types@0.1.153/index.d.ts" />

import { background } from '../../background.ts'
import { isNonNullish } from '../../../common.ts'

function sendMessage(tabIds: number[], rawMessage: string) {
  tabIds.forEach((tabId) => chrome.tabs.sendMessage(tabId, rawMessage))
}

background((listener) => {
  chrome.runtime.onMessage.addListener(
    (rawMessage, _sender, sendResponse) => {
      if (typeof rawMessage !== 'string') {
        return
      }

      Promise.resolve(listener(rawMessage)).then((response: unknown) => {
        if (isNonNullish(response)) {
          // @ts-expect-error 何故か sendResponse が引数を取らないような型になっている
          sendResponse(JSON.stringify(response))
        }
      })
      return true
    },
  )
}, async (_type, body, { activeTab } = {}) => {
  const tabIds = await (async () => {
    if (activeTab) {
      const windowId = await chrome.windows.getLastFocused().then((win) =>
        win.id
      )
      if (!windowId) {
        return []
      }

      const [tab] = await chrome.tabs.query({ active: true, windowId })
      if (!tab?.id) {
        return []
      }

      return [tab.id]
    } else {
      const tabs = await chrome.tabs.query({})
      return tabs.map(({ id }) => id).filter(isNonNullish)
    }
  })()

  sendMessage(tabIds, body)
})
