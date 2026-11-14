// SPDX-License-Identifier: MIT

/**
 * FreeCut sets drag cursors and `user-select` on `document.body`. An editor in
 * a shadow root can't be reached from there, so each change also goes to the
 * editor's `.ec-root` elements (its root and its portal layer), which the
 * timeline registers while it's mounted. The stylesheet matches
 * `:is(body, .ec-root)` for every such class.
 */

const roots = new Set<HTMLElement>()

/** Registers the editor's roots for global cursor classes and styles; returns the unregister. */
export function registerGlobalCursorRoots(
  ...elements: Array<HTMLElement | null | undefined>
): () => void {
  const added = elements.filter(
    (element): element is HTMLElement =>
      !!element && element !== document.body && !roots.has(element),
  )
  for (const element of added) roots.add(element)
  return () => {
    for (const element of added) roots.delete(element)
  }
}

/** `document.body` and every registered editor root. */
export function getGlobalCursorTargets(): HTMLElement[] {
  return [document.body, ...roots]
}

export function addGlobalCursorClass(...classes: string[]): void {
  for (const target of getGlobalCursorTargets()) target.classList.add(...classes)
}

export function removeGlobalCursorClass(...classes: string[]): void {
  for (const target of getGlobalCursorTargets()) target.classList.remove(...classes)
}

export function toggleGlobalCursorClass(className: string, force: boolean): void {
  for (const target of getGlobalCursorTargets()) target.classList.toggle(className, force)
}

/**
 * `document.querySelector` that also looks inside the registered editor
 * roots, for module-level code that has no element to start from.
 */
export function queryEditorElement<E extends Element = HTMLElement>(selector: string): E | null {
  for (const root of roots) {
    const found = root.querySelector<E>(selector)
    if (found) return found
  }
  return document.querySelector<E>(selector)
}

/** `document.querySelectorAll` over the document and every registered editor root. */
export function queryEditorElements<E extends Element = HTMLElement>(selector: string): E[] {
  const found = new Set<E>(document.querySelectorAll<E>(selector))
  for (const root of roots)
    for (const element of root.querySelectorAll<E>(selector)) found.add(element)
  return [...found]
}

type GlobalStyleProperty = 'cursor' | 'userSelect'

/**
 * Sets an inline style on every target and returns a function restoring each
 * target's previous value, the port of FreeCut's
 * `const original = document.body.style.cursor; …; document.body.style.cursor = original`.
 */
export function setGlobalCursorStyle(property: GlobalStyleProperty, value: string): () => void {
  const previous = getGlobalCursorTargets().map(
    (target) => [target, target.style[property]] as const,
  )
  for (const [target] of previous) target.style[property] = value
  return () => {
    for (const [target, original] of previous) target.style[property] = original
  }
}
