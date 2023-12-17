import { messengerCreator } from '../message.ts'
import { Script } from '../type.ts'

export const extensionB2CMessenger = messengerCreator<
  ({
    type: 'exec-order'
    request: {
      scriptName: string
    }
  })
>()

export const extensionC2BMessenger = messengerCreator<
  ({
    type: 'get-matched-script-urls'
    request: {
      currentUrl: string
    }
    response: {
      scriptMap: Record<string, Script>
    }
  })
>()
