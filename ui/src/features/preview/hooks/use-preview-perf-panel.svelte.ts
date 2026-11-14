// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'

import { select } from '$lib/store.svelte'
import { useDebugStore } from '@/features/preview/deps/editor-debug'
import {
  PREVIEW_PERF_PANEL_QUERY_KEY,
  PREVIEW_PERF_PANEL_STORAGE_KEY,
  type PreviewPerfSnapshot,
  parsePreviewPerfPanelQuery,
} from '@/features/preview/utils/preview-constants'

const POLL_INTERVAL_MS = 250

export function usePreviewPerfPanel() {
  const showPerfPanel = select(useDebugStore, (s) => s.showPreviewPerfPanel)
  const setShowPerfPanel = useDebugStore.getState().setShowPreviewPerfPanel
  let perfPanelSnapshot = $state.raw<PreviewPerfSnapshot | null>(null)
  const setPerfPanelSnapshot = (
    next:
      | PreviewPerfSnapshot
      | null
      | ((prev: PreviewPerfSnapshot | null) => PreviewPerfSnapshot | null),
  ) => {
    perfPanelSnapshot =
      typeof next === 'function'
        ? (next as (prev: PreviewPerfSnapshot | null) => PreviewPerfSnapshot | null)(
            untrack(() => perfPanelSnapshot),
          )
        : next
  }
  const initializedRef = { current: false }
  const hasSyncedRef = { current: false }

  $effect(() => {
    if (!import.meta.env.DEV) return

    let panelEnabled = window.__PREVIEW_PERF_PANEL__ === true
    const queryOverride = parsePreviewPerfPanelQuery(
      new URLSearchParams(window.location.search).get(PREVIEW_PERF_PANEL_QUERY_KEY),
    )
    if (queryOverride !== null) {
      panelEnabled = queryOverride
      try {
        window.localStorage.setItem(PREVIEW_PERF_PANEL_STORAGE_KEY, panelEnabled ? '1' : '0')
      } catch {
        // Ignore storage failures (private mode / quota / disabled storage).
      }
    } else {
      try {
        const persisted = window.localStorage.getItem(PREVIEW_PERF_PANEL_STORAGE_KEY)
        if (persisted === '1' || persisted === '0') {
          panelEnabled = persisted === '1'
        }
      } catch {
        // Ignore storage failures (private mode / quota / disabled storage).
      }
    }

    window.__PREVIEW_PERF_PANEL__ = panelEnabled
    initializedRef.current = true
    setShowPerfPanel(panelEnabled)
    setPerfPanelSnapshot(panelEnabled ? (window.__PREVIEW_PERF__ ?? null) : null)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey && event.key.toLowerCase() === 'p')) return
      event.preventDefault()
      const nextEnabled = !(window.__PREVIEW_PERF_PANEL__ === true)
      setShowPerfPanel(nextEnabled)
    }

    const intervalId = setInterval(() => {
      if (window.__PREVIEW_PERF_PANEL__ !== true) return
      setPerfPanelSnapshot(window.__PREVIEW_PERF__ ?? null)
    }, POLL_INTERVAL_MS)

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearInterval(intervalId)
    }
  })

  $effect(() => {
    if (!import.meta.env.DEV || !initializedRef.current) return
    if (!hasSyncedRef.current) {
      hasSyncedRef.current = true
      return
    }

    window.__PREVIEW_PERF_PANEL__ = showPerfPanel.current
    try {
      window.localStorage.setItem(PREVIEW_PERF_PANEL_STORAGE_KEY, showPerfPanel.current ? '1' : '0')
    } catch {
      // Ignore storage failures (private mode / quota / disabled storage).
    }

    setPerfPanelSnapshot(showPerfPanel.current ? (window.__PREVIEW_PERF__ ?? null) : null)
  })

  const latestRenderSourceSwitch = $derived.by(
    () =>
      perfPanelSnapshot?.renderSourceHistory[perfPanelSnapshot.renderSourceHistory.length - 1] ??
      null,
  )

  return {
    get showPerfPanel() {
      return showPerfPanel.current
    },
    get perfPanelSnapshot() {
      return perfPanelSnapshot
    },
    get latestRenderSourceSwitch() {
      return latestRenderSourceSwitch
    },
  }
}
