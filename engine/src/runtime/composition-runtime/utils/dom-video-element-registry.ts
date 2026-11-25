/** EmbeddableCut: told when the elements of an item change. */
const listenersByItemId = new Map<string, Set<() => void>>()

/** EmbeddableCut: calls `listener` whenever an element of `itemId` comes or goes. */
export function subscribeDomVideoElements(itemId: string, listener: () => void): () => void {
  const listeners = listenersByItemId.get(itemId) ?? new Set()
  listenersByItemId.set(itemId, listeners)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) listenersByItemId.delete(itemId)
  }
}

function notifyDomVideoElements(itemId: string): void {
  for (const listener of listenersByItemId.get(itemId) ?? []) listener()
}

const videoElementsByItemId = new Map<string, Set<HTMLVideoElement>>()

function getOrCreateItemElements(itemId: string): Set<HTMLVideoElement> {
  const existing = videoElementsByItemId.get(itemId)
  if (existing) return existing

  const next = new Set<HTMLVideoElement>()
  videoElementsByItemId.set(itemId, next)
  return next
}

export function registerDomVideoElement(itemId: string, element: HTMLVideoElement): void {
  getOrCreateItemElements(itemId).add(element)
  notifyDomVideoElements(itemId)
}

export function unregisterDomVideoElement(itemId: string, element: HTMLVideoElement): void {
  const itemElements = videoElementsByItemId.get(itemId)
  if (!itemElements) return

  itemElements.delete(element)
  if (itemElements.size === 0) {
    videoElementsByItemId.delete(itemId)
  }
  notifyDomVideoElements(itemId)
}

/** EmbeddableCut: whether `itemId` has an element, with a picture yet or not. */
export function hasDomVideoElement(itemId: string): boolean {
  return videoElementsByItemId.has(itemId)
}

export function getBestDomVideoElementForItem(itemId: string): HTMLVideoElement | null {
  const itemElements = videoElementsByItemId.get(itemId)
  if (!itemElements || itemElements.size === 0) {
    return null
  }

  let best: HTMLVideoElement | null = null
  let bestReadyState = 0

  for (const element of itemElements) {
    if (!element.isConnected) {
      itemElements.delete(element)
      continue
    }

    if (element.readyState > bestReadyState && element.videoWidth > 0) {
      best = element
      bestReadyState = element.readyState
    }
  }

  if (itemElements.size === 0) {
    videoElementsByItemId.delete(itemId)
  }

  return best
}

export function clearDomVideoElementRegistry(): void {
  videoElementsByItemId.clear()
}
