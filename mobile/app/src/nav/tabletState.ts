// iPad's regular-width layout; a narrow multitasking window keeps the phone navigation.
export function tabletWidth(os: string, pad: boolean, width: number): boolean {
  return os === 'ios' && pad && width >= 768
}

/** Arrow keys follow the current list, including when a sync removed the selection. */
export function nextTaskId(ids: readonly string[], selected: string | null, direction: -1 | 1): string | null {
  if (!ids.length) return null
  const i = selected ? ids.indexOf(selected) : -1
  if (i < 0) return direction === 1 ? ids[0] : ids[ids.length - 1]
  return ids[Math.max(0, Math.min(ids.length - 1, i + direction))]
}
