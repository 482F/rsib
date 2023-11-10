/// <reference types="https://unpkg.com/chrome-types@0.1.153/index.d.ts" />

import { Message } from '../../ext-type.ts'

import { background } from '../../background.ts'
import { isNonNullish } from '../../../common.ts'

function sendMessage(tabIds: number[], message: Message) {
  tabIds.forEach((tabId) =>
    chrome.tabs.sendMessage(tabId, JSON.stringify(message))
  )
}

background(async (body, option) => {
  const tabIds = await (async () => {
    if (option?.activeTab) {
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
  console.log({ body, option, tabIds })

  sendMessage(tabIds, body)
})
