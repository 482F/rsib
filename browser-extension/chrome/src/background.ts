import { background } from '../../background.ts'
import { isNonNullish } from '../../../common.ts'

function sendMessage(tabIds: number[], rawMessage: string) {
  tabIds.forEach((tabId) => chrome.tabs.sendMessage(tabId, rawMessage))
}

async function getActiveTabId() {
  const windowId = await chrome.windows.getLastFocused().then((win) => win.id)
  if (!windowId) {
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, windowId })
  if (!tab?.id) {
    return
  }

  return tab.id
}

background((listener) => {
  chrome.runtime.onMessage.addListener(
    (rawMessage, _sender, sendResponse) => {
      if (typeof rawMessage !== 'string') {
        return
      }

      Promise.resolve(listener(rawMessage)).then((response: unknown) => {
        if (isNonNullish(response)) {
          sendResponse(JSON.stringify(response))
        }
      })
      return true
    },
  )
}, async (_type, body, { activeTab, tabIds } = {}) => {
  tabIds ??= await (async () => {
    if (activeTab) {
      return [await getActiveTabId() ?? 0].filter(Boolean)
    } else {
      const tabs = await chrome.tabs.query({})
      return tabs.map(({ id }) => id).filter(isNonNullish)
    }
  })()

  sendMessage(tabIds, body)
}, (id, label, callback) => {
  chrome.contextMenus.create({ id, title: label })
  const listener: Parameters<
    typeof chrome.contextMenus.onClicked.addListener
  >[0] = ({ menuItemId }) => {
    if (menuItemId === id) {
      callback(null)
    }
  }
  chrome.contextMenus.onClicked.addListener(listener)
  return () => {
    chrome.contextMenus.remove(id)
    chrome.contextMenus.onClicked.removeListener(listener)
  }
}, getActiveTabId)
