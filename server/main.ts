#!/usr/bin/env -S deno run --no-config --allow-net --allow-read --ext ts
// ['~/git/deno-user-script/**/*.bundled.js'] みたいな感じで設定
/**
 *  http://localhost:55923/script/get-lyrics.ts.bundled.js で配信
 *  /list でファイル一覧配信
 */

import { port } from '../const.ts'
import { apis, callApi, createWsSender, parseUSComment } from '../common.ts'
import { Command } from 'https://deno.land/x/cliffy@v0.25.7/command/mod.ts'
import { expandGlob } from 'https://deno.land/std@0.205.0/fs/expand_glob.ts'
import { basename } from 'https://deno.land/std@0.205.0/path/basename.ts'

async function serve(_: unknown, ...scriptPathGlobs: string[]) {
  const scriptPaths = new Set<string>()

  for (const glob of scriptPathGlobs) {
    for await (const entry of expandGlob(glob)) {
      if (!entry.isFile) {
        continue
      }
      scriptPaths.add(entry.path)
    }
  }

  const scriptMap = Object.fromEntries(
    await Promise.all([...scriptPaths].map(async (scriptPath) => {
      const body = await Deno.readTextFile(scriptPath)
      const metas = parseUSComment(body)
      return {
        name: metas.name ?? basename(scriptPath),
        path: scriptPath,
        body,
        match: metas.match,
        'run-at': metas['run-at'],
      }
    })).then((scripts) => scripts.map((script) => [script.name, script])),
  )

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

        return new Response(JSON.stringify(
          await apis[rest](
            await request.json().catch(() => ({})),
            { wsSender, scriptMap },
          ),
        ))
      } else if (first === 'script') {
        const script = scriptMap[rest]
        if (!script) {
          return new Response()
        }

        const file = await Deno.open(script.path, { read: true })
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
      .arguments('<script-glob-patterns...>')
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
