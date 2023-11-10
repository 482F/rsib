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

        listener(rawMessage)
        return true
      },
    )
  },
)
