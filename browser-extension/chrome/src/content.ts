/// <reference types="https://unpkg.com/chrome-types@0.1.153/index.d.ts" />

import { listen } from '../../content.ts'

listen(
  (listener) => {
    chrome.runtime.onMessage.addListener(
      (rawMessage, sender, _sendResponse) => {
        console.log({ rawMessage, sender })

        if (typeof rawMessage !== 'string') {
          return
        }

        const message = (() => {
          try {
            return JSON.parse(rawMessage)
          } catch (_e) {
            return null
          }
        })()

        listener(message)
        return true
      },
    )
  },
)
