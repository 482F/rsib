import { messengerCreator } from '../message.ts'

export const extensionMessenger = messengerCreator<
  ({
    type: 'exec-order'
    request: {
      scriptUrl: string
    }
  })
>()
