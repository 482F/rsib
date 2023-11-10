#!/usr/bin/env -S deno run --no-config --allow-net --allow-read --allow-env=HOME --ext ts

import { port } from '../const.ts'
import { apis, callApi, isNonNullish, parseUSComment } from '../common.ts'
import { expandGlob } from 'https://deno.land/std@0.205.0/fs/expand_glob.ts'
import {
  basename,
  dirname,
  globToRegExp,
  resolve,
} from 'https://deno.land/std@0.205.0/path/mod.ts'
import { Command } from 'https://deno.land/x/cliffy@v0.25.7/command/mod.ts'
import { Script } from '../type.ts'
import { delay } from 'https://deno.land/std@0.206.0/async/mod.ts'
import { websocketMessenger } from '../message.ts'

function debounce<P extends unknown[], R>(
  func: (...args: P) => R,
  waitMs: number,
): (...args: P) => Promise<R> {
  let resolver: (result: R) => void = () => {}
  let promise: Promise<R> = new Promise((r) => resolver = r)
  let lastCalled = -Infinity
  return async (...args: P) => {
    const current = lastCalled = Date.now()
    await delay(waitMs)
    if (lastCalled !== current) {
      return promise
    }
    resolver(await func(...args))
    promise = new Promise((r) => resolver = r)
    return promise
  }
}

function watchGlobs(
  globs: string[],
  handler: (event: Deno.FsEvent) => Promise<void> | void,
) {
  const regexes = globs.map((glob) => globToRegExp(glob))

  const globAndIsDeeps = globs.map((glob) => ({
    glob,
    isDeep: glob.includes('**'),
  }))

  const deepTargetPathSet = new Set(
    globAndIsDeeps.filter(({ isDeep }) => isDeep)
      .map(({ glob }) => glob.replace(/\*\*.+$/, '')),
  )

  const shallowTargetPathSet = new Set(
    globAndIsDeeps.filter(({ isDeep }) => !isDeep)
      .map(({ glob }) => dirname(glob)),
  )
  ;[
    { pathSet: deepTargetPathSet, recursive: true },
    { pathSet: shallowTargetPathSet, recursive: false },
  ]
    .forEach(async ({ pathSet, recursive }) => {
      for await (
        const event of Deno.watchFs([...pathSet].map((path) => resolve(path)), {
          recursive,
        })
      ) {
        event.paths = event.paths.filter((path) =>
          regexes.some((regex) => regex.test(path))
        )
        if (event.paths.length <= 0) {
          continue
        }
        await handler(event)
      }
    })
}

const distResolveRules: {
  key: string
  resolver: (path: string, metas: Record<string, string>) => string
}[] = [
  { key: 'path', resolver: (path) => path },
  { key: 'name', resolver: (path) => basename(path) },
  { key: 'dir', resolver: (path) => dirname(path) },
]

async function readScript(scriptPath: string): Promise<Script> {
  const body = await Deno.readTextFile(scriptPath)
  const ancestorUsComments = await Promise.all(
    scriptPath.split('/')
      .slice(0, -1)
      .map((_, i, splitteds) =>
        Deno.readTextFile(splitteds.slice(0, i + 1).join('/') + '/uscomment.js')
          .catch(() => null)
      ),
  ).then((r) => r.filter(isNonNullish))
  const metas = parseUSComment(body, ancestorUsComments)

  const dist = distResolveRules.reduce(
    (dist, rule) =>
      dist.replaceAll(`\${${rule.key}}`, rule.resolver(scriptPath, metas)),
    metas.dist ?? '',
  )

  return {
    name: metas.name ?? basename(scriptPath),
    path: scriptPath,
    dist,
    match: metas.match,
    runAt: metas['run-at'],
  }
}

async function serve(_: unknown, ...rawScriptPathGlobs: string[]) {
  // ホームディレクトリ展開 (ログインユーザのみ)
  const scriptPathGlobs = rawScriptPathGlobs.map((glob) =>
    glob.replace(/^~/, Deno.env.get('HOME') || '~')
  )

  const scriptPaths = new Set<string>()

  // glob から該当するファイルのみ抽出
  for (const glob of scriptPathGlobs) {
    for await (const entry of expandGlob(glob)) {
      if (!entry.isFile) {
        continue
      }
      scriptPaths.add(entry.path)
    }
  }

  // UserScript コメントからメタデータ抽出 & 整形
  const scriptNameMap = Object.fromEntries(
    await Promise.all([...scriptPaths].map(readScript)).then((scripts) =>
      scripts.map((script) => [script.name, script])
    ),
  )
  const scriptPathMap = Object.fromEntries(
    Object.entries(scriptNameMap).map(([, script]) => [script.path, script]),
  )

  const webSockets: Set<WebSocket> = new Set()
  const wsSender = websocketMessenger.createSender(webSockets)

  // chrome extension background が止まらないように keepalive
  setInterval(() => wsSender('keepalive', {}), 1000 * 20)

  const updateFunctionMap: Record<string, () => void> = {}

  // glob 下を監視
  watchGlobs(scriptPathGlobs, (e) => {
    e.paths.forEach((path) => {
      ;(updateFunctionMap[path] ??= debounce(
        async () => {
          const script = await readScript(path).catch(() => null)
          if (script) {
            // body 以外のメタデータが同一であれば変更なしとする
            if (
              JSON.stringify({ ...script, body: '' }) ===
                JSON.stringify({ ...(scriptPathMap[path] ?? {}), body: '' })
            ) {
              return
            }

            scriptPathMap[path] = script
            scriptNameMap[script.name] = script
            wsSender('update-scriptmap', {
              scriptMap: { [script.name]: script },
              isInit: false,
            })
          } else {
            const { name } = scriptPathMap[path] ?? {}
            if (!name) {
              return
            }
            delete scriptPathMap[path]
            delete scriptNameMap[name]
            wsSender('update-scriptmap', {
              scriptMap: { [name]: null },
              isInit: false,
            })
          }
        },
        1000,
      ))()
    })
  })

  // websocket と HTTP エンドポイント待ち受け
  Deno.serve({
    port,
    handler: async (request) => {
      if (request.headers.get('upgrade') === 'websocket') {
        const { socket, response } = Deno.upgradeWebSocket(request)

        socket.onopen = () => {
          webSockets.add(socket)
          wsSender('update-scriptmap', {
            scriptMap: scriptNameMap,
            isInit: true,
          }, { targets: [socket] })
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

      if (first === 'api') {
        if (!((key: string): key is keyof typeof apis => key in apis)(rest)) {
          return new Response()
        }

        return new Response(JSON.stringify(
          await apis[rest](
            await request.json().catch(() => ({})),
            { wsSender, scriptMap: scriptNameMap },
          ),
        ))
      } else if (first === 'script') {
        const script = scriptNameMap[decodeURIComponent(rest)]
        if (!script) {
          return new Response()
        }

        const file = await Deno.open(script.dist ?? script.path, { read: true })
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
