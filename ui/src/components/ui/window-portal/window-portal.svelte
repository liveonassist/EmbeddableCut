<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { WindowPortalProps } from './types'


  interface WindowPosition {
    left: number
    top: number
  }

  function loadPosition(
    key: string,
    fallback: WindowPosition,
    winWidth: number,
    winHeight: number,
  ): WindowPosition {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return fallback
      const parsed = JSON.parse(raw) as Partial<WindowPosition>
      if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
        const sw = window.screen.availWidth
        const sh = window.screen.availHeight
        return {
          left: Math.max(0, Math.min(parsed.left, sw - winWidth)),
          top: Math.max(0, Math.min(parsed.top, sh - winHeight)),
        }
      }
    } catch {
      // ignore
    }
    return fallback
  }

  function savePosition(key: string, pos: WindowPosition): void {
    try {
      localStorage.setItem(key, JSON.stringify(pos))
    } catch {
      // ignore
    }
  }

  /**
   * Copy the editor's styles into the child window. An embedded editor keeps
   * its stylesheet in its shadow root's adopted sheets rather than the page's
   * <style> elements, so those are serialized too.
   */
  function copyStyles(sourceDoc: Document, styleRoot: Node, targetDoc: Document): void {
    // Copy <link> stylesheets
    for (const link of Array.from(sourceDoc.querySelectorAll('link[rel="stylesheet"]'))) {
      const clone = targetDoc.createElement('link')
      clone.rel = 'stylesheet'
      clone.href = (link as HTMLLinkElement).href
      targetDoc.head.appendChild(clone)
    }

    // Copy <style> elements (includes Tailwind's generated styles)
    for (const style of Array.from(sourceDoc.querySelectorAll('style'))) {
      const clone = targetDoc.createElement('style')
      clone.textContent = style.textContent
      targetDoc.head.appendChild(clone)
    }

    if (styleRoot instanceof ShadowRoot) {
      for (const sheet of styleRoot.adoptedStyleSheets) {
        const clone = targetDoc.createElement('style')
        clone.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n')
        targetDoc.head.appendChild(clone)
      }
    }

    // Copy CSS custom properties from :root / <html>
    const rootStyles = sourceDoc.documentElement.getAttribute('style')
    if (rootStyles) {
      targetDoc.documentElement.setAttribute('style', rootStyles)
    }

    // Copy class names from <html> (dark mode class, etc.)
    const rootClasses = sourceDoc.documentElement.className
    if (rootClasses) {
      targetDoc.documentElement.className = rootClasses
    }

    // Copy inline styles from <body> if any
    const bodyStyles = sourceDoc.body.getAttribute('style')
    if (bodyStyles) {
      targetDoc.body.setAttribute('style', bodyStyles)
    }
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'

  let {
    children,
    title,
    width = 400,
    height = 500,
    storageKey,
    externalWindow: providedExternalWindow = null,
    autoHeight = false,
    onBlocked,
    onClose,
  }: WindowPortalProps = $props()

  // The editor's portal layer carries its theme and token overrides.
  const editorPortal = portalTarget()
  let container = $state<HTMLDivElement | null>(null)
  let externalWindow: Window | null = null

  $effect(() => {
    const nextTitle = title
    if (!externalWindow || externalWindow.closed) return
    externalWindow.document.title = nextTitle
  })

  $effect(() => {
    const deps = { autoHeight, height, providedExternalWindow, storageKey, title, width }

    const defaultPos: WindowPosition = {
      left: window.screenX + 100,
      top: window.screenY + 100,
    }
    const pos = deps.storageKey
      ? loadPosition(deps.storageKey, defaultPos, deps.width, deps.height)
      : defaultPos

    let win = deps.providedExternalWindow ?? externalWindow
    if (!(win && !win.closed)) {
      const features = [
        `width=${deps.width}`,
        `height=${deps.height}`,
        `left=${pos.left}`,
        `top=${pos.top}`,
        'menubar=no',
        'toolbar=no',
        'location=no',
        'status=no',
      ].join(',')

      win = window.open('', '', features)
      if (!win) {
        untrack(() => onBlocked ?? onClose)()
        return
      }
    }

    externalWindow = win
    win.document.title = deps.title
    win.document.body.style.margin = '0'
    win.document.body.style.padding = '0'
    win.document.body.style.overflow = 'hidden'

    if (!win.document.getElementById('window-portal-style-marker')) {
      copyStyles(document, editorPortal.getRootNode(), win.document)
      const styleMarker = win.document.createElement('meta')
      styleMarker.id = 'window-portal-style-marker'
      win.document.head.appendChild(styleMarker)
    }

    let root = win.document.getElementById('window-portal-root') as HTMLDivElement | null
    if (!root) {
      root = win.document.createElement('div')
      root.id = 'window-portal-root'
      root.className = 'ec-root'
      if (editorPortal.dataset.theme) root.dataset.theme = editorPortal.dataset.theme
      const tokens = editorPortal.getAttribute('style')
      if (tokens) root.setAttribute('style', tokens)
      root.style.width = '100vw'
      root.style.height = deps.autoHeight ? 'auto' : '100vh'
      root.style.overflow = 'hidden'
      win.document.body.appendChild(root)
    }
    container = root

    // Force correct size — window.open() features are unreliable on Windows Chrome.
    try {
      const chromeW = Math.max(0, win.outerWidth - win.innerWidth)
      const chromeH = Math.max(0, win.outerHeight - win.innerHeight)
      win.resizeTo(deps.width + chromeW, deps.autoHeight ? win.outerHeight : deps.height + chromeH)
      win.moveTo(pos.left, pos.top)
    } catch {
      // ignore
    }

    const child = win

    const persistPosition = () => {
      if (!deps.storageKey || child.closed) return
      savePosition(deps.storageKey, { left: child.screenX, top: child.screenY })
    }

    // Child window closed by user
    const handleUnload = () => {
      persistPosition()
      externalWindow = null
      container = null
      onClose()
    }

    // Parent window refresh/close → close child
    const handleParentUnload = () => {
      if (!child.closed) child.close()
    }

    child.addEventListener('beforeunload', handleUnload)
    window.addEventListener('beforeunload', handleParentUnload)

    // autoHeight: wait for stylesheets to load, then measure content and resize
    let cancelled = false
    const rootEl = root
    const fitWindowToContent = () => {
      if (cancelled || child.closed) return
      const contentHeight = rootEl.scrollHeight
      if (contentHeight > 0) {
        const chromeHeight = Math.max(0, child.outerHeight - child.innerHeight)
        child.resizeTo(child.outerWidth, contentHeight + chromeHeight)
      }
    }
    if (deps.autoHeight) {
      // Wait for all <link> stylesheets in the popup to finish loading
      const links = Array.from(child.document.querySelectorAll('link[rel="stylesheet"]'))
      const pending = links.filter((link) => !(link as HTMLLinkElement).sheet)
      if (pending.length === 0) {
        setTimeout(fitWindowToContent, 50)
      } else {
        let remaining = pending.length
        const onDone = () => {
          remaining--
          if (remaining <= 0) {
            setTimeout(fitWindowToContent, 50)
          }
        }
        for (const link of pending) {
          link.addEventListener('load', onDone)
          link.addEventListener('error', onDone)
        }
      }
    }

    // Observe content size changes for autoHeight windows
    let resizeObserver: ResizeObserver | undefined
    if (deps.autoHeight) {
      resizeObserver = new ResizeObserver(fitWindowToContent)
      resizeObserver.observe(rootEl)
    }

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      child.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('beforeunload', handleParentUnload)
      persistPosition()
    }
  })

  // React deferred the close past StrictMode's remount; Svelte unmounts once, so close on destroy.
  $effect(() => () => {
    if (externalWindow && !externalWindow.closed) externalWindow.close()
    externalWindow = null
  })
</script>

{#if container}
  <Portal to={container}>{@render children()}</Portal>
{/if}
