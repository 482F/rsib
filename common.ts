function _parseUsComment(body: string) {
  return [...body.matchAll(/==UserScript==[\s\S]+==\/UserScript==/g)]
    .flatMap((match) =>
      [...(match[0] ?? '').matchAll(
        /^\/\/\!?\s+\@(?<key>\S+)\s+(?<value>.+)$/mg,
      )].map((
        rawEntry,
      ) => [rawEntry.groups?.key ?? '', rawEntry.groups?.value ?? ''])
    )
}
export function parseUSComment(body: string, ancestors: string[]) {
  return Object.fromEntries([...ancestors, body].flatMap(_parseUsComment))
}

export function isNonNullish<T>(val: T): val is T & Record<string, unknown> {
  return val !== null && val !== undefined
}
