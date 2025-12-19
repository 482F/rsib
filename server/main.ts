#!/usr/bin/env -S deno run -A --unstable-detect-cjs --ext ts

import type esbuild from 'npm:esbuild'
import { port } from '../const.ts'
import { isNonNullish, parseUSComment } from '../common.ts'
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
import { apiMessenger, websocketMessenger } from '../message.ts'
import * as denoBuild from 'deno-build'
import { debounce } from 'npm:es-toolkit'

const apiCaller = apiMessenger.createSender()

async function ancestor(basePath: string, targetName: string | RegExp) {
  for (
    let currentBase = basePath;
    currentBase !== dirname(currentBase);
    currentBase = dirname(currentBase)
  ) {
    if (await Deno.stat(currentBase).then((s) => !s.isDirectory)) {
      continue
    }

    for await (const entry of Deno.readDir(currentBase)) {
      if (entry.name.match(targetName)) {
        return resolve(currentBase, entry.name)
      }
    }
  }
  return
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
      .map(({ glob }) => glob.replace(/\*\*.*$/, '')),
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

async function getBuilder(mainPath: string) {
  return denoBuild.getBuilder(
    mainPath,
    { denoConfigPath: await ancestor(mainPath, /deno.jsonc?/) },
    {
      minify: true,
      sourcemap: 'inline',
    },
  )
}

const distResolveRules: {
  key: string
  resolver: (path: string, metas: Record<string, string[]>) => string
}[] = [
  { key: 'path', resolver: (path) => path },
  { key: 'name', resolver: (path) => basename(path) },
  { key: 'dir', resolver: (path) => dirname(path) },
]

async function readScript(scriptPath: string): Promise<Script | null> {
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
    metas.dist?.at(-1) ?? '',
  )

  const name = metas.name?.at(-1)

  if (!name) {
    return null
  }

  return {
    name,
    path: scriptPath,
    dist,
    match: metas.match ?? [],
    runAt: metas['run-at'] ?? [],
    require: metas.require ?? [],
  }
}

async function serve(_: unknown, ...rawScriptPathGlobs: string[]) {
  const builts = (() => {
    const builtMap: {
      [path in string]: Promise<
        Awaited<ReturnType<typeof getBuilder>> & {
          lastContents: null | Uint8Array
        }
      >
    } = {}

    return {
      async get(path: string) {
        return await builtMap[path]
      },
      add(
        path: string,
        onBuilt?: (result: esbuild.BuildResult) => void | Promise<void>,
      ) {
        const { promise, resolve } = Promise.withResolvers<
          Awaited<typeof builtMap[string]>
        >()
        builtMap[path] ??= promise

        if (builtMap[path] !== promise) {
          return
        }
        ;(async () => {
          const builder: Awaited<typeof builtMap[string]> = await getBuilder(
            path,
          ).then((r) => ({
            ...r,
            lastContents: null,
          }))

          for await (const result of builder.results) {
            builder.lastContents = result.outputFiles?.[0]?.contents ??
              builder.lastContents
            resolve(builder)
            await onBuilt?.(result)
          }
        })()
      },
      async remove(path: string) {
        ;(await this.get(path))?.dispose()
        delete builtMap[path]
      },
    }
  })()

  const webSockets: Set<WebSocket> = new Set()
  const wsSender = websocketMessenger.createSender(webSockets)

  // chrome extension background が止まらないように keepalive
  setInterval(() => wsSender('keepalive', {}), 1000 * 20)

  const updateFunctionMap: Record<string, () => void> = {}

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

  const scriptNameMap: { [name in string]: Script } = {}
  const scriptPathMap: { [path in string]: Script } = {}

  function update(path: string) {
    ;(updateFunctionMap[path] ??= debounce(
      async () => {
        // UserScript コメントからメタデータ抽出 & 整形
        const script = await readScript(path).catch(() => null)
        if (script) {
          const old = scriptPathMap[path]
          const keys = Object.keys({
            ...script,
            ...(old ?? {}),
          }) as (keyof Script)[]
          const diffMap = Object.fromEntries(
            keys.map((key) => [key, script[key] !== old?.[key]] as const),
          )
          builts.add(script.path, updateFunctionMap[path])

          if (
            Object.entries(diffMap)
              .map(([, isDiff]) => isDiff)
              .some(Boolean)
          ) {
            scriptPathMap[path] = script
            scriptNameMap[script.name] = script
            wsSender('update-scriptmap', {
              scriptMap: { [script.name]: script },
              isInit: false,
            })
          }
        } else {
          const { name } = scriptPathMap[path] ?? {}
          if (!name) {
            return
          }
          delete scriptPathMap[path]
          delete scriptNameMap[name]
          await builts.remove(path)
          wsSender('update-scriptmap', {
            scriptMap: { [name]: null },
            isInit: false,
          })
        }
      },
      1000,
    ))()
  }

  scriptPaths.forEach(update)
  // glob 下を監視
  watchGlobs(scriptPathGlobs, (e) => {
    if (
      ![
        'create',
        'rename',
        'modify', // TODO: 単一の編集で複数回ビルドされていないか確認。依存の方では esbuild からのみ発火するけど、本体だと？debounce されてるのかな
        'remove',
      ].includes(e.kind)
    ) {
      return
    }
    e.paths.forEach(update)
  })

  const listener = apiMessenger.createListener(async (listener) => {
    // websocket と HTTP エンドポイント待ち受け
    Deno.serve({
      port,
      async handler(request) {
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
        const url = new URL(request.url)
        const path = url.pathname.replace(/^\//, '')
        const [, first = '', rest = ''] = path.match(/^([^\/]+)\/(.+)$/) ?? []
        const param = Object.fromEntries([...url.searchParams.entries()])

        if (first === 'api') {
          return new Response(
            JSON.stringify(listener(
              rest as any,
              await request.text().catch(() => 'null'),
            )),
          )
          // return apiHandler(rest, await request.text().catch(() => 'null'))
        } else if (first === 'script') {
          const script = scriptNameMap[decodeURIComponent(rest)]
          if (!script) {
            return new Response()
          }

          const built = await builts.get(script.path)

          // TODO: ソースマップ削る
          return new Response(built?.lastContents, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'text/javascript',
            },
          })
        } else if (first === 'sourcemap') {
          return new Response(scriptNameMap[rest]?.sourceMap ?? '')
        }

        return new Response()
      },
    })
  })

  listener(
    {
      exec({ scriptName }) {
        wsSender('exec-order', { scriptName })
        return null
      },
      list() {
        return { scriptMap: scriptNameMap }
      },
    },
  )
}

async function exec(_: unknown, scriptName: string) {
  await apiCaller('exec', { scriptName })
}

const command = new Command()
  .name('rsib')
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
