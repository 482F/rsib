/// <reference types="https://unpkg.com/chrome-types@0.1.153/index.d.ts" />

import { content } from '../../content.ts'

content(
  (listener) => {
    chrome.runtime.onMessage.addListener(
      (rawMessage, _sender, _sendResponse) => {
        if (typeof rawMessage !== 'string') {
          return
        }

        listener(rawMessage)
        return true
      },
    )
  },
  async (_type, rawMessage) => {
    return await chrome.runtime.sendMessage(rawMessage)
  },
)
