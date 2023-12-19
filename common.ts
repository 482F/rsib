function _parseUsComment(body: string) {
  return [...body.matchAll(/==UserScript==[\s\S]+==\/UserScript==/g)]
    .flatMap((match) =>
      [...(match[0] ?? '').matchAll(
        /^\/\/\!?\s+\@(?<key>\S+)\s+(?<value>.+)$/mg,
      )].map((
        rawEntry,
      ) => [rawEntry.groups?.key ?? '', rawEntry.groups?.value ?? ''] as const)
    )
}
export function parseUSComment(body: string, ancestors: string[]) {
  const entries = [...ancestors, body].flatMap(_parseUsComment)
  const map: Record<string, string[]> = {}
  for (const [key, value] of entries) {
    ;(map[key] ??= []).push(value)
  }
  return map
}

export function isNonNullish<T>(val: T): val is T & Record<string, unknown> {
  return val !== null && val !== undefined
}
