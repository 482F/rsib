/// <reference types="https://unpkg.com/chrome-types@0.1.153/index.d.ts" />

import { background } from '../../background.ts'
import { isNonNullish } from '../../../common.ts'

function sendMessage(tabIds: number[], rawMessage: string) {
  tabIds.forEach((tabId) => chrome.tabs.sendMessage(tabId, rawMessage))
}

background(async (body, { activeTab } = {}) => {
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
