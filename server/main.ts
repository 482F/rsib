#!/usr/bin/env -S deno run --no-config --allow-net --allow-read --ext ts
// { 'user-script': '~/git/deno-user-script/**/*.bundled.js' } みたいな感じで設定
/**
 *  http://localhost:55923/script/user-script/get-lyrics.ts.bundled.js で配信
 *  /list でファイル一覧配信
 *  /exec で即時実行など
 *   websocket も同一ポートで待ち受けられるっぽい
 */

import { port } from '../const.ts'
import { apis, callApi, createWsSender } from '../common.ts'
import { Command } from 'https://deno.land/x/cliffy@v0.25.7/command/mod.ts'

function serve(_: unknown, configFilePath: string) {
  const webSockets: Set<WebSocket> = new Set()
  const wsSender = createWsSender(webSockets)

  setInterval(() => wsSender('keepalive', {}), 1000 * 20)
  Deno.serve({
    port,
    handler: async (request) => {
      if (request.headers.get('upgrade') === 'websocket') {
        const { socket, response } = Deno.upgradeWebSocket(request)

        socket.onopen = () => {
          webSockets.add(socket)
        }
        socket.onclose = () => {
          webSockets.delete(socket)
        }
        socket.onerror = () => {
          webSockets.delete(socket)
        }

        return response
      }
      const path = new URL(request.url).pathname.replace(/^\//, '')
      const [, first = '', rest = ''] = path.match(/^([^\/]+)\/(.+)$/) ?? []
      console.log({ path, first, rest })

      if (first === 'api') {
        if (!((key: string): key is keyof typeof apis => key in apis)(rest)) {
          return new Response()
        }

        return await apis[rest](
          await request.json().catch(() => ({})),
          wsSender,
        )
      } else if (first === 'script') {
        const file = await Deno.open(
          '/home/normal/temp/deno-build/main.ts.bundled.js',
          { read: true },
        )
        return new Response(file.readable)
      }

      return new Response()
    },
  })
}

async function exec(_: unknown, scriptName: string) {
  await callApi('exec', {
    scriptName,
  })
}

const command = new Command()
  .name('rbsib')
  .action(() => {
    command.showHelp()
  })
  .command(
    'serve',
    new Command()
      .description('launch server')
      .arguments('<config-file:string>')
      .action(serve),
  )
  .command(
    'exec',
    new Command()
      .description('send immediate execution request to server')
      .arguments('<script-name:string>')
      .action(exec),
  )

command.parse(Deno.args)
