#!/usr/bin/env -S deno run -A --watch
import * as path from 'jsr:@std/path'
import * as fs from 'node:fs/promises'

async function watchGlob(
  glob: string,
  callback: (event: Deno.FsEvent) => void,
) {
  const globRegExp = path.globToRegExp(glob)
  async function _watchGlob(
    glob: string,
    depth: number,
  ) {
    const trim = (start: number, end?: number) =>
      glob.split(path.SEPARATOR).slice(start, end).join(path.SEPARATOR)
    const me = trim(0, depth + 1) + path.SEPARATOR
    const isDir = await fs.stat(me).then((i) => i.isDirectory).catch(() =>
      false
    )
    if (!isDir) {
      return () => {}
    }
    console.log('watch start: ' + me)

    const watcher = Deno.watchFs(me, { recursive: false })
    const closer: { [path in string]: () => void } = {}
    ;(async () => {
      const nextRegExp = path.globToRegExp(trim(0, depth + 2))
      const watchNext = async (target: string) => {
        if (!nextRegExp.test(target)) {
          return
        }
        if (!(await fs.stat(target).then((s) => s.isDirectory))) {
          return
        }
        // ** の場合は切り詰めずに次の glob を作る
        let restGlob = trim(depth + 1)
        if (!restGlob.startsWith('**')) {
          restGlob = trim(depth + 2)
        }
        const newCloser = await _watchGlob(
          target + path.SEPARATOR + restGlob,
          depth + 1,
        )
        console.log('try call closer')
        closer[target]?.()
        console.log('called closer')
        closer[target] = newCloser
        console.log('add closer')
      }
      for (const entry of await fs.readdir(me)) {
        watchNext(path.resolve(me, entry))
      }
      for await (const event of watcher) {
        // 何故か recursive: false な watcher でも深いイベントが来てしまうので、直下のイベントかどうかを判定する
        const isMe = event.paths.some((p) =>
          path.relative(me, p).includes(path.SEPARATOR)
        )
        if (isMe) {
          continue
        }

        const matched = event.paths.some((p) => globRegExp.test(p))
        if (matched) {
          console.log('callebacked:', me)
          callback(event)
        }

        const [removed, created] = (() => {
          switch (event.kind) {
            case 'create':
              return [, event.paths[0]]
            case 'remove':
              return [event.paths[0]]
            case 'rename':
              return event.paths
            default:
              return []
          }
        })()

        if (created) {
          watchNext(created)
        }
        if (removed) {
          closer[removed]?.()
          delete closer[removed]
        }
      }
    })()

    return () => {
      Object.values(closer).forEach((c) => c())
      console.log('watch end  : ' + me)
      watcher.close()
    }
  }
  return await _watchGlob(glob, 0)
}
await watchGlob('/home/normal/temp/glob/**/b/*', (e) => {
  if (e.kind === 'access') {
    return
  }
  console.log(e)
})
