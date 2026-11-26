<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity'
  import { Dialog as DialogPrimitive } from 'bits-ui'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import Download from '@lucide/svelte/icons/download'
  import Keyboard from '@lucide/svelte/icons/keyboard'
  import Plus from '@lucide/svelte/icons/plus'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Search from '@lucide/svelte/icons/search'
  import Upload from '@lucide/svelte/icons/upload'
  import X from '@lucide/svelte/icons/x'
  import { toast } from 'svelte-sonner'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { cn } from '@/shared/ui/cn'
  import {
    HOTKEYS,
    createHotkeyExportDocument,
    findHotkeyConflicts,
    formatHotkeyBinding,
    getBrowserHostileHotkey,
    getHotkeyBindingFromEventData,
    getHotkeyPrimaryTokenFromEventData,
    hasHotkeyPrimaryToken,
    normalizeHotkeyBinding,
    parseHotkeyImportDocument,
    splitHotkeyBinding,
    type HotkeyKey,
    type HotkeyOverrideMap,
  } from '@/config/hotkeys'
  import {
    HOTKEY_EDITOR_SECTIONS,
    getHotkeyBindingDisplayLabel,
    getHotkeyEditorSearchResults,
    type HotkeyEditorItem,
    type HotkeyEditorSection,
  } from '../hotkey-editor-sections'
  import { useNaturalHeight } from '@/shared/ui/use-natural-height.svelte'
  import { useSettingsStore } from '@/features/settings/stores/settings-store'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { useKeyboardLayoutLabels } from '../../hooks/use-keyboard-layout.svelte'
  import { useResolvedHotkeys } from '../../hooks/use-resolved-hotkeys.svelte'
  import HotkeyBindingPill from './hotkey-binding-pill.svelte'
  import KeyboardPreview from './keyboard-preview.svelte'
  import { SpringValue, collapse } from './motion.svelte'
  import {
    FILTER_CHIP_MODES,
    HOTKEY_ITEM_BY_KEY,
    buildImportChanges,
    computeHotkeyFilterCounts,
    downloadJsonFile,
    getHotkeyFilterResults,
    getSlotLabelKey,
    readTextFile,
    type HotkeyFilterMode,
    type PendingHotkeyImport,
  } from './model'

  const reducedMotionQuery = new MediaQuery('(prefers-reduced-motion: reduce)')
  const reduceMotion = $derived(reducedMotionQuery.current)
  const resolvedHotkeys = useResolvedHotkeys()
  const hotkeys = $derived(resolvedHotkeys.current)
  const overridesSlice = select(useSettingsStore, (state) => state.hotkeyOverrides)
  const hotkeyOverrides = $derived(overridesSlice.current)
  // The store's actions never change; read them when called.
  const settings = () => useSettingsStore.getState()
  const layout = useKeyboardLayoutLabels()
  let fileInput = $state<HTMLInputElement | null>(null)
  let partialConflictOverrideSnapshot: HotkeyOverrideMap | null = null
  // Overrides captured when a recording session began, so a completed overwrite
  // can offer a single "Undo" that reverts every unbind it caused.
  let preCaptureOverrides: HotkeyOverrideMap | null = null

  let selectedKey = $state<HotkeyKey>('PLAY_PAUSE')
  let activeLayer = $state.raw<HotkeyEditorSection | null>(null)
  let hoveredToken = $state<string | null>(null)
  let hoveredKey = $state<HotkeyKey | null>(null)
  let captureKey = $state<HotkeyKey | null>(null)
  let draftBinding = $state('')
  let previewBinding = $state('')
  let searchQuery = $state('')
  let filterMode = $state<HotkeyFilterMode>('all')
  let pendingImport = $state.raw<PendingHotkeyImport | null>(null)
  let isResetAllDialogOpen = $state(false)

  // The command list's height animates to fit its content so the dialog shrinks
  // for short sections instead of leaving dead space; tall content caps and
  // scrolls. Measured from the natural content height (inside the scroller).
  let commandList = $state<HTMLDivElement | null>(null)
  const commandListNatural = useNaturalHeight(() => commandList)
  let commandListReady = $state(false)
  $effect(() => {
    if (commandListNatural.current > 0 && !commandListReady) commandListReady = true
  })
  const maxCommandListHeight = $derived(
    Math.round((typeof window === 'undefined' ? 900 : window.innerHeight) * 0.5),
  )
  const commandListHeight = $derived(
    commandListNatural.current > 0
      ? Math.min(commandListNatural.current, maxCommandListHeight)
      : undefined,
  )
  const commandListSpring = new SpringValue({ stiffness: 460, damping: 42, mass: 0.9 })
  $effect(() => {
    commandListSpring.set(commandListHeight, { instant: reduceMotion || !commandListReady })
  })
  $effect(() => () => commandListSpring.stop())

  const selectedItem = $derived(HOTKEY_ITEM_BY_KEY[selectedKey])
  const isSelectedCustom = $derived(selectedKey in hotkeyOverrides)
  const isSelectedUnassigned = $derived(hotkeys[selectedKey] === '')
  const customCount = $derived(Object.keys(hotkeyOverrides).length)
  const isCapturingSelectedKey = $derived(captureKey === selectedKey)
  const activePreviewBinding = $derived(
    isCapturingSelectedKey
      ? draftBinding || previewBinding || hotkeys[selectedKey]
      : hotkeys[selectedKey],
  )
  const captureConflicts = $derived(
    captureKey && draftBinding ? findHotkeyConflicts(hotkeys, draftBinding, captureKey) : [],
  )
  const isDraftChanged = $derived(
    Boolean(
      captureKey && draftBinding && normalizeHotkeyBinding(draftBinding) !== hotkeys[captureKey],
    ),
  )
  const canSaveCapture = $derived(
    Boolean(
      captureKey &&
      draftBinding &&
      hasHotkeyPrimaryToken(draftBinding) &&
      captureConflicts.length === 0 &&
      isDraftChanged,
    ),
  )
  const selectedBrowserHotkey = $derived(getBrowserHostileHotkey(hotkeys[selectedKey]))
  const pendingBrowserHotkey = $derived(
    captureKey && draftBinding ? getBrowserHostileHotkey(draftBinding) : null,
  )
  const searchResults = $derived(
    getHotkeyEditorSearchResults({
      query: searchQuery,
      sections: HOTKEY_EDITOR_SECTIONS,
      hotkeys,
      translate: t,
    }),
  )
  const hasSearchQuery = $derived(searchQuery.trim().length > 0)
  const isFiltering = $derived(filterMode !== 'all' && !hasSearchQuery)
  const filterResults = $derived(
    filterMode === 'all' ? [] : getHotkeyFilterResults(filterMode, hotkeys, hotkeyOverrides),
  )
  const filterCounts = $derived(computeHotkeyFilterCounts(hotkeys, hotkeyOverrides))
  const activeResults = $derived(hasSearchQuery ? searchResults : filterResults)
  const showResultList = $derived(hasSearchQuery || isFiltering)
  const selectedSection = $derived(
    HOTKEY_EDITOR_SECTIONS.find((section) =>
      section.items.some((item) => item.keys.includes(selectedKey)),
    ),
  )
  const liveMessage = $derived(
    isCapturingSelectedKey
      ? draftBinding
        ? captureConflicts.length > 0
          ? t('projects.settings.hotkeys.announceConflict', {
              binding: formatHotkeyBinding(draftBinding),
              action: t(HOTKEY_ITEM_BY_KEY[captureConflicts[0]!].labelKey),
            })
          : t('projects.settings.hotkeys.announceCaptured', {
              binding: formatHotkeyBinding(draftBinding),
            })
        : t('projects.settings.hotkeys.announceRecording', { command: t(selectedItem.labelKey) })
      : '',
  )

  function stopCapture({ restorePartialOverwrites = true } = {}) {
    const snapshot = partialConflictOverrideSnapshot
    partialConflictOverrideSnapshot = null

    if (restorePartialOverwrites && snapshot) {
      settings().replaceHotkeyOverrides(snapshot)
    }

    captureKey = null
    draftBinding = ''
    previewBinding = ''
  }

  $effect(() => {
    if (!captureKey) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        stopCapture()
        return
      }

      const nextBinding = getHotkeyBindingFromEventData(event)
      if (!nextBinding) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      previewBinding = nextBinding

      if (getHotkeyPrimaryTokenFromEventData(event)) {
        draftBinding = nextBinding
      } else {
        draftBinding = ''
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  })

  // Closing the editor mid-overwrite restores what the partial overwrites unbound.
  $effect(() => () => {
    const snapshot = partialConflictOverrideSnapshot
    partialConflictOverrideSnapshot = null

    if (snapshot) {
      settings().replaceHotkeyOverrides(snapshot)
    }
  })

  function startCapture(key: HotkeyKey) {
    stopCapture()
    preCaptureOverrides = { ...useSettingsStore.getState().hotkeyOverrides }
    selectedKey = key
    captureKey = key
  }

  function showUndoToast(message: string, snapshot: HotkeyOverrideMap) {
    toast.success(message, {
      action: {
        label: t('projects.settings.hotkeys.undo'),
        onClick: () => settings().replaceHotkeyOverrides(snapshot),
      },
    })
  }

  // Revert to the pre-recording snapshot — used after an overwrite unbinds other
  // commands, so a single click restores everything the session changed.
  function finishCaptureWithUndo(message: string) {
    const snapshot = preCaptureOverrides
    preCaptureOverrides = null
    if (snapshot) {
      showUndoToast(message, snapshot)
    }
  }

  const layerTokens = $derived.by(() => {
    if (!activeLayer) return new Set<string>()
    const modifiers = new Set(['mod', 'alt', 'shift'])
    const tokens = new Set<string>()
    for (const item of activeLayer.items) {
      for (const key of item.keys) {
        for (const token of splitHotkeyBinding(hotkeys[key])) {
          if (!modifiers.has(token)) tokens.add(token)
        }
      }
    }
    return tokens
  })

  const tokenLabels = $derived.by(() => {
    const map = new Map<string, string>()
    const sections = activeLayer ? [activeLayer] : HOTKEY_EDITOR_SECTIONS
    for (const section of sections) {
      for (const item of section.items) {
        const itemLabel = t(item.labelKey)
        for (const key of item.keys) {
          for (const token of splitHotkeyBinding(hotkeys[key])) {
            if (token === 'mod' || token === 'alt' || token === 'shift') continue
            const existing = map.get(token)
            if (existing) {
              if (!existing.includes(itemLabel)) {
                map.set(token, `${existing}, ${itemLabel}`)
              }
            } else {
              map.set(token, itemLabel)
            }
          }
        }
      }
    }
    return map
  })

  const hoverTokens = $derived.by(() => {
    if (hoveredKey) {
      return new Set(splitHotkeyBinding(hotkeys[hoveredKey]))
    }
    if (!hoveredToken) return new Set<string>()
    const modifiers = new Set(['mod', 'alt', 'shift'])
    if (modifiers.has(hoveredToken)) return new Set<string>()
    const sections = activeLayer ? [activeLayer] : HOTKEY_EDITOR_SECTIONS
    for (const section of sections) {
      for (const item of section.items) {
        for (const key of item.keys) {
          const tokens = splitHotkeyBinding(hotkeys[key])
          const primary = tokens.filter((t) => !modifiers.has(t))
          if (primary.includes(hoveredToken)) return new Set(tokens)
        }
      }
    }
    return new Set<string>()
  })

  function saveCapture() {
    if (!captureKey || !canSaveCapture) {
      return
    }

    settings().setHotkeyBinding(captureKey, normalizeHotkeyBinding(draftBinding))
    stopCapture({ restorePartialOverwrites: false })
  }

  function overwriteConflictingHotkey(conflictKey: HotkeyKey) {
    if (!captureKey || !draftBinding || !hasHotkeyPrimaryToken(draftBinding)) {
      return
    }

    if (!partialConflictOverrideSnapshot) {
      partialConflictOverrideSnapshot = {
        ...useSettingsStore.getState().hotkeyOverrides,
      }
    }

    const remainingConflicts = captureConflicts.filter((key) => key !== conflictKey)
    settings().unbindHotkeyBinding(conflictKey)

    if (remainingConflicts.length === 0) {
      settings().setHotkeyBinding(captureKey, normalizeHotkeyBinding(draftBinding))
      stopCapture({ restorePartialOverwrites: false })
      finishCaptureWithUndo(t('projects.settings.hotkeys.reassignedToast'))
    }
  }

  function overwriteAllConflictingHotkeys() {
    if (!captureKey || !draftBinding || !hasHotkeyPrimaryToken(draftBinding)) {
      return
    }

    for (const conflictKey of captureConflicts) {
      settings().unbindHotkeyBinding(conflictKey)
    }
    settings().setHotkeyBinding(captureKey, normalizeHotkeyBinding(draftBinding))
    stopCapture({ restorePartialOverwrites: false })
    finishCaptureWithUndo(t('projects.settings.hotkeys.reassignedToast'))
  }

  function unbindSelectedHotkey() {
    settings().unbindHotkeyBinding(selectedKey)
    stopCapture({ restorePartialOverwrites: false })
  }

  function resetSelectedHotkey() {
    settings().resetHotkeyBinding(selectedKey)
    stopCapture({ restorePartialOverwrites: false })
  }

  function confirmResetAllHotkeys() {
    settings().resetHotkeys()
    stopCapture({ restorePartialOverwrites: false })
    toast.success(t('projects.settings.hotkeys.resetAllToast'))
  }

  function handleTokenClick(token: string) {
    if (token === 'mod' || token === 'alt' || token === 'shift') return
    stopCapture()
    hoveredToken = null
    const sections = activeLayer ? [activeLayer] : HOTKEY_EDITOR_SECTIONS
    for (const section of sections) {
      for (const item of section.items) {
        for (const key of item.keys) {
          const tokens = splitHotkeyBinding(hotkeys[key])
          const primary = tokens.filter((t) => t !== 'mod' && t !== 'alt' && t !== 'shift')
          if (primary.length === 1 && primary[0] === token) {
            selectedKey = key
            return
          }
        }
      }
    }
    for (const section of sections) {
      for (const item of section.items) {
        for (const key of item.keys) {
          if (splitHotkeyBinding(hotkeys[key]).includes(token)) {
            selectedKey = key
            return
          }
        }
      }
    }
  }

  function selectSearchResult(item: HotkeyEditorItem) {
    stopCapture()
    selectedKey = item.keys[0]!
  }

  function exportHotkeys() {
    try {
      const exportDocument = createHotkeyExportDocument(hotkeyOverrides)
      const fileName = `embeddablecut-hotkeys-${exportDocument.exportedAt.slice(0, 10)}.json`
      downloadJsonFile(`${JSON.stringify(exportDocument, null, 2)}\n`, fileName)
      toast.success(t('projects.settings.hotkeys.downloadedToast', { fileName }))
    } catch {
      toast.error(t('projects.settings.hotkeys.exportFailed'))
    }
  }

  // Parse and diff the preset, then stage it for confirmation instead of
  // silently replacing the user's whole config.
  async function importHotkeys(file: File) {
    try {
      const contents = await readTextFile(file)
      const importResult = parseHotkeyImportDocument(JSON.parse(contents))
      const changes = buildImportChanges(hotkeys, importResult.overrides)

      if (changes.length === 0) {
        toast.success(t('projects.settings.hotkeys.importNoChanges'))
        return
      }

      pendingImport = { overrides: importResult.overrides, result: importResult, changes }
    } catch {
      toast.error(t('projects.settings.hotkeys.importFailed'))
    }
  }

  function applyPendingImport() {
    if (!pendingImport) {
      return
    }

    const snapshot = { ...useSettingsStore.getState().hotkeyOverrides }
    const { result } = pendingImport

    settings().replaceHotkeyOverrides(pendingImport.overrides)
    stopCapture({ restorePartialOverwrites: false })
    pendingImport = null

    const messages = [
      t('projects.settings.hotkeys.importedCommands', { count: result.importedCommandCount }),
    ]
    if (result.remappedCommandCount > 0) {
      messages.push(
        t('projects.settings.hotkeys.remappedCount', { count: result.remappedCommandCount }),
      )
    }
    if (result.ignoredCommandCount > 0) {
      messages.push(
        t('projects.settings.hotkeys.ignoredCount', { count: result.ignoredCommandCount }),
      )
    }
    if (result.sourceVersion !== null) {
      messages.push(t('projects.settings.hotkeys.presetVersion', { version: result.sourceVersion }))
    }

    showUndoToast(messages.join(' - '), snapshot)
  }

  function handleImportButtonClick() {
    fileInput?.click()
  }

  async function handleImportFileChange(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) {
      return
    }

    await importHotkeys(file)
  }

  function isItemHighlighted(item: HotkeyEditorItem): boolean {
    return Boolean(
      (hoveredKey && item.keys.includes(hoveredKey)) ||
      (hoveredToken &&
        item.keys.some((k) => splitHotkeyBinding(hotkeys[k]).includes(hoveredToken!))),
    )
  }
</script>

<div
  class="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--color-primary)_14%,transparent),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]"
>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    class="sr-only"
    onchange={(event) => void handleImportFileChange(event)}
  />

  <!-- ── Header ── -->
  <div class="flex items-center gap-4 border-b border-white/6 px-5 py-2.5">
    <div class="flex flex-1 items-center gap-2.5">
      <Keyboard class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="text-sm font-medium text-foreground">
        {t('projects.settings.hotkeys.title')}
      </span>
      <span class="text-sm text-muted-foreground">
        {t('projects.settings.hotkeys.subtitle')}
      </span>
    </div>
    <span
      class="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-primary"
    >
      {t('projects.settings.hotkeys.customCount', { count: customCount })}
    </span>
    <DialogPrimitive.Close
      class="shrink-0 rounded-md border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
    >
      <X class="h-4 w-4" />
      <span class="sr-only">{t('common.close')}</span>
    </DialogPrimitive.Close>
  </div>

  <!-- ── Full-width keyboard preview with section layers ── -->
  <div class="px-4 pb-3 md:px-5">
    <div class="flex min-h-[380px] overflow-hidden rounded-lg border border-white/7 bg-[#0d0d0f]/90">
      <!-- Section layers sidebar -->
      <div class="flex w-44 shrink-0 flex-col gap-0.5 border-r border-white/6 p-2 xl:w-52">
        <div class="relative mb-2">
          <Search
            class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            bind:value={searchQuery}
            placeholder={t('projects.settings.hotkeys.searchPlaceholder')}
            class="h-8 border-white/10 bg-white/5 pl-8 pr-2 text-xs"
          />
        </div>
        {#if !hasSearchQuery}
          <div class="mb-2 flex flex-wrap gap-1">
            {#each FILTER_CHIP_MODES as mode (mode)}
              <button
                type="button"
                aria-pressed={filterMode === mode}
                onclick={() => {
                  stopCapture()
                  activeLayer = null
                  filterMode = filterMode === mode ? 'all' : mode
                }}
                class={cn(
                  'rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors duration-150 ease-out motion-reduce:transition-none',
                  filterMode === mode
                    ? 'border-primary/45 bg-primary/15 text-primary'
                    : 'border-white/8 bg-white/4 text-muted-foreground hover:text-foreground/80',
                )}
              >
                {t(`projects.settings.hotkeys.filters.${mode}`)} {filterCounts[mode]}
              </button>
            {/each}
          </div>
        {/if}
        {#if showResultList}
          <div class="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            <div
              class="px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              {t('projects.settings.hotkeys.searchResultCount', {
                count: activeResults.length,
              })}
            </div>
            <div role="list" aria-label={t('projects.settings.hotkeys.searchResults')}>
              {#if activeResults.length > 0}
                {#each activeResults as { section, item } (item.keys.join('|'))}
                  {@const isSelectedResult = item.keys.includes(selectedKey)}
                  <div role="listitem">
                    <button
                      type="button"
                      onclick={() => selectSearchResult(item)}
                      class={cn(
                        'w-full rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-out motion-reduce:transition-none',
                        isSelectedResult
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/80',
                      )}
                    >
                      <div class="text-[11px] font-medium leading-4 text-foreground">
                        {t(item.labelKey)}
                      </div>
                      <div class="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em]">
                        {t(section.titleKey)} · {item.keys
                          .map((key) =>
                            getHotkeyBindingDisplayLabel(
                              hotkeys[key],
                              t('projects.settings.hotkeys.unassigned'),
                            ),
                          )
                          .join(' / ')}
                      </div>
                    </button>
                  </div>
                {/each}
              {:else}
                <div
                  class="rounded-lg border border-white/8 bg-white/4 px-2.5 py-2 text-xs leading-4 text-muted-foreground"
                >
                  {t('projects.settings.hotkeys.noSearchResults')}
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <button
            type="button"
            onclick={() => {
              stopCapture()
              filterMode = 'all'
              activeLayer = null
            }}
            class={cn(
              'rounded-lg px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.16em] transition-colors duration-150 ease-out motion-reduce:transition-none',
              activeLayer === null
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/80',
            )}
          >
            {t('projects.settings.hotkeys.all')}
          </button>
          <div class="my-1 border-t border-white/6"></div>
          {#each HOTKEY_EDITOR_SECTIONS as section (section.titleKey)}
            <button
              type="button"
              onclick={() => {
                stopCapture()
                filterMode = 'all'
                activeLayer = section
                selectedKey = section.items[0]!.keys[0]!
              }}
              class={cn(
                'rounded-lg px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.16em] transition-colors duration-150 ease-out motion-reduce:transition-none',
                activeLayer === section
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/80',
              )}
            >
              {t(section.titleKey)}
            </button>
          {/each}
        {/if}
      </div>
      <!-- Keyboard -->
      <div class="flex min-w-0 flex-1 flex-col justify-center p-4 md:p-5">
        <KeyboardPreview
          activeBinding={activePreviewBinding}
          {layerTokens}
          {hoverTokens}
          {tokenLabels}
          labelForToken={layout.labelForToken}
          isNativeLayout={layout.isNativeLayout}
          ariaLabel={t('projects.settings.hotkeys.keyboardLabel')}
          emptyKeyLabel={(keyLabel) => t('projects.settings.hotkeys.keyNoCommand', { key: keyLabel })}
          layoutFallbackNote={t('projects.settings.hotkeys.layoutFallbackNote')}
          onTokenHover={(token) => (hoveredToken = token)}
          onTokenClick={handleTokenClick}
        />
      </div>

      <!-- Selected command panel — beside keyboard -->
      <div class="w-[280px] shrink-0 space-y-3 border-l border-white/6 p-4 pt-5">
        <div aria-live="polite" role="status" class="sr-only">
          {liveMessage}
        </div>
        <div class="border-b border-white/6 pb-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {t('projects.settings.hotkeys.selectedCommand')}
              </div>
              <div class="mt-1 text-base font-semibold tracking-tight text-foreground">
                {t(selectedItem.labelKey)}
              </div>
            </div>
            {#if isSelectedCustom}
              <span
                class="mt-1 shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-primary"
              >
                {t('projects.settings.hotkeys.custom')}
              </span>
            {/if}
          </div>
          {#if selectedSection?.scopeKey}
            <div
              class="mt-2 flex items-center gap-1.5 rounded-md border border-white/8 bg-white/4 px-2 py-1 text-[10px] leading-4 text-muted-foreground"
            >
              <span
                class="shrink-0 rounded-sm bg-primary/15 px-1.5 py-0.5 font-medium uppercase tracking-[0.12em] text-primary"
              >
                {t('projects.settings.hotkeys.scopedBadge')}
              </span>
              <span>{t(selectedSection.scopeKey)}</span>
            </div>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('projects.settings.hotkeys.current')}
            </div>
            <div class="mt-1 font-medium text-foreground">
              {getHotkeyBindingDisplayLabel(
                hotkeys[selectedKey],
                t('projects.settings.hotkeys.unassigned'),
              )}
            </div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('projects.settings.hotkeys.default')}
            </div>
            <div class="mt-1 text-muted-foreground">
              {formatHotkeyBinding(HOTKEYS[selectedKey])}
            </div>
          </div>
        </div>

        <div class="space-y-1.5">
          {#each selectedItem.keys as key, index (key)}
            {@const isAlternateSlot = index > 0}
            {@const slotBinding =
              captureKey === key ? draftBinding || previewBinding || hotkeys[key] : hotkeys[key]}
            {@const isSlotUnassigned = hotkeys[key] === ''}
            <div
              class={cn(
                'rounded-lg border p-2 transition-colors duration-150 ease-out motion-reduce:transition-none',
                selectedKey === key ? 'border-primary/35 bg-primary/8' : 'border-white/6 bg-white/3',
              )}
            >
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t(getSlotLabelKey(selectedItem, key))}
                </span>
                {#if isAlternateSlot && !isSlotUnassigned}
                  <button
                    type="button"
                    aria-label={t('projects.settings.hotkeys.removeBinding')}
                    onclick={() => settings().unbindHotkeyBinding(key)}
                    class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                  >
                    <X class="h-3 w-3" />
                  </button>
                {/if}
              </div>
              {#if isAlternateSlot && isSlotUnassigned && captureKey !== key}
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 w-full justify-center gap-1 text-[11px]"
                  onclick={() => startCapture(key)}
                >
                  <Plus class="h-3 w-3" />
                  {t('projects.settings.hotkeys.addAlternate')}
                </Button>
              {:else}
                <div class="flex justify-end">
                  <HotkeyBindingPill
                    binding={slotBinding}
                    isActive={selectedKey === key}
                    isListening={captureKey === key}
                    isCustom={key in hotkeyOverrides}
                    onClick={() => startCapture(key)}
                  />
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if selectedBrowserHotkey}
          <div style="overflow: hidden" transition:collapse={{ reduce: reduceMotion }}>
            <div class="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3 text-xs">
              <div class="flex items-center gap-1.5 text-amber-300">
                <AlertTriangle class="h-3.5 w-3.5" />
                {t('projects.settings.hotkeys.browserOverride')}
              </div>
              <p class="mt-1 leading-4 text-foreground/84">
                {t('projects.settings.hotkeys.mayOverride', {
                  binding: formatHotkeyBinding(selectedBrowserHotkey.binding),
                  action: selectedBrowserHotkey.browserAction.toLowerCase(),
                })}
              </p>
            </div>
          </div>
        {/if}

        <div class={cn('grid gap-1.5', isCapturingSelectedKey ? 'grid-cols-2' : 'grid-cols-3')}>
          {#if isCapturingSelectedKey}
            <Button size="sm" class="w-full" onclick={saveCapture} disabled={!canSaveCapture}>
              {t('common.save')}
            </Button>
            <Button size="sm" variant="outline" class="w-full" onclick={() => stopCapture()}>
              {t('common.cancel')}
            </Button>
          {:else}
            <Button size="sm" class="w-full" onclick={() => startCapture(selectedKey)}>
              {t('projects.settings.hotkeys.record')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="w-full"
              onclick={unbindSelectedHotkey}
              disabled={isSelectedUnassigned}
            >
              {t('projects.settings.hotkeys.unbind')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="w-full"
              onclick={resetSelectedHotkey}
              disabled={!isSelectedCustom}
            >
              {t('common.reset')}
            </Button>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="outline" class="w-full gap-1.5" onclick={handleImportButtonClick}>
            <Upload class="h-3.5 w-3.5" />
            {t('projects.settings.hotkeys.import')}
          </Button>
          <Button size="sm" variant="outline" class="w-full gap-1.5" onclick={exportHotkeys}>
            <Download class="h-3.5 w-3.5" />
            {t('projects.settings.hotkeys.export')}
          </Button>
        </div>

        {#if isCapturingSelectedKey}
          <div style="overflow: hidden" transition:collapse={{ reduce: reduceMotion }}>
            <div class="rounded-lg border border-primary/20 bg-primary/8 p-3">
              <div class="text-[10px] uppercase tracking-[0.18em] text-primary">
                {t('projects.settings.hotkeys.listening')}
              </div>
              <p class="mt-1 text-xs leading-4 text-foreground/88">
                {t('projects.settings.hotkeys.listeningHint')}
              </p>
              {#if captureConflicts.length > 0}
                <div style="overflow: hidden" transition:collapse={{ reduce: reduceMotion }}>
                  <div
                    class="mt-3 space-y-2 rounded-md border border-destructive/25 bg-destructive/8 p-2"
                  >
                    <div class="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertTriangle class="h-3.5 w-3.5" />
                      {t('projects.settings.hotkeys.conflictDetected')}
                    </div>
                    {#each captureConflicts as key (key)}
                      {@const hotkeyItem = HOTKEY_ITEM_BY_KEY[key]}
                      <div class="flex items-center justify-between gap-2 text-xs text-foreground/88">
                        <span class="min-w-0 flex-1">
                          {t('projects.settings.hotkeys.conflictsWith', {
                            action: t(hotkeyItem.labelKey),
                          })}
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          class="h-6 shrink-0 px-2 text-[10px]"
                          onclick={() => overwriteConflictingHotkey(key)}
                        >
                          {t('projects.settings.hotkeys.overwrite')}
                        </Button>
                      </div>
                    {/each}
                    {#if captureConflicts.length > 1}
                      <Button
                        size="sm"
                        variant="destructive"
                        class="h-7 w-full px-2 text-[11px]"
                        onclick={overwriteAllConflictingHotkeys}
                      >
                        {t('projects.settings.hotkeys.overwriteAll')}
                      </Button>
                    {/if}
                  </div>
                </div>
              {/if}
              {#if pendingBrowserHotkey}
                <div style="overflow: hidden" transition:collapse={{ reduce: reduceMotion }}>
                  <div class="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
                    <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {t('projects.settings.hotkeys.thisOverrides', {
                        action: pendingBrowserHotkey.browserAction.toLowerCase(),
                      })}
                    </span>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <p class="text-[11px] leading-4 text-muted-foreground">
          {t('projects.settings.hotkeys.importExportHint')}
        </p>

        <div class="border-t border-white/6 pt-3">
          <AlertDialog bind:open={isResetAllDialogOpen}>
            <Button
              variant="destructive"
              size="sm"
              class="w-full gap-1.5"
              onclick={() => (isResetAllDialogOpen = true)}
              disabled={customCount === 0}
            >
              <RotateCcw class="h-3.5 w-3.5" />
              {t('projects.settings.hotkeys.resetAll')}
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('projects.settings.hotkeys.resetAllConfirmTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('projects.settings.hotkeys.resetAllConfirmDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onclick={confirmResetAllHotkeys}
                >
                  {t('projects.settings.hotkeys.resetAllConfirmAction')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  </div>

  <!--
    Command list — height animates to fit its content so the dialog shrinks
    for short sections; tall content caps at 50vh and scrolls.
  -->
  <div
    class="min-h-0 overflow-hidden border-t border-white/8"
    style:height={commandListSpring.current === undefined
      ? 'auto'
      : `${commandListSpring.current}px`}
  >
    <div class="h-full overflow-y-auto">
      <div bind:this={commandList} class="columns-[240px] gap-x-2 gap-y-0 px-4 py-2 md:px-5">
        {#each activeLayer ? [activeLayer] : HOTKEY_EDITOR_SECTIONS as section (section.titleKey)}
          <div class="break-inside-avoid">
            {#if !activeLayer}
              <div
                class="mb-0.5 mt-1.5 first:mt-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
              >
                {t(section.titleKey)}
              </div>
            {/if}
            {#each section.items as item (`${section.titleKey}-${item.labelKey}`)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class={cn(
                  'mb-1 break-inside-avoid rounded border px-2 py-1 text-left transition-colors duration-150 ease-out motion-reduce:transition-none',
                  hoveredToken || hoveredKey
                    ? isItemHighlighted(item)
                      ? 'border-primary/35 bg-primary/10'
                      : 'border-white/7 bg-white/4'
                    : item.keys.includes(selectedKey)
                      ? 'border-primary/35 bg-primary/10'
                      : 'border-white/7 bg-white/4 hover:border-white/12 hover:bg-white/6',
                )}
                onmouseenter={() => (hoveredKey = item.keys[0]!)}
                onmouseleave={() => (hoveredKey = null)}
              >
                <div class="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onclick={() => {
                      stopCapture()
                      selectedKey = item.keys[0]!
                    }}
                    class="min-w-0 flex-1 rounded text-left text-[12px] leading-5 text-foreground/92 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
                  >
                    {t(item.labelKey)}
                  </button>
                  <div class="flex shrink-0 flex-col items-end gap-1">
                    {#each item.keys as key (key)}
                      <HotkeyBindingPill
                        binding={captureKey === key
                          ? draftBinding || previewBinding || hotkeys[key]
                          : hotkeys[key]}
                        isActive={selectedKey === key}
                        isListening={captureKey === key}
                        isCustom={key in hotkeyOverrides}
                        onClick={() => startCapture(key)}
                      />
                    {/each}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Import review — confirm a preset before it replaces the current config. -->
  <AlertDialog
    bind:open={
      () => pendingImport !== null,
      (open) => {
        if (!open) pendingImport = null
      }
    }
  >
    <AlertDialogContent class="max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle>{t('projects.settings.hotkeys.importReviewTitle')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('projects.settings.hotkeys.importReviewDescription')}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {#if pendingImport}
        <div class="space-y-2">
          <div class="text-xs text-muted-foreground">
            {t('projects.settings.hotkeys.importChangeCount', {
              count: pendingImport.changes.length,
            })}{customCount > 0
              ? ` · ${t('projects.settings.hotkeys.importReplaceCount', { count: customCount })}`
              : ''}{pendingImport.result.ignoredCommandCount > 0
              ? ` · ${t('projects.settings.hotkeys.ignoredCount', {
                  count: pendingImport.result.ignoredCommandCount,
                })}`
              : ''}
          </div>
          <div
            class="max-h-56 space-y-1 overflow-y-auto rounded-md border border-white/8 bg-white/3 p-2"
          >
            {#each pendingImport.changes as change (change.key)}
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="min-w-0 flex-1 truncate text-foreground/90">
                  {t(change.labelKey)}
                </span>
                <span class="flex shrink-0 items-center gap-1 text-[11px]">
                  <span class="text-muted-foreground line-through">
                    {getHotkeyBindingDisplayLabel(
                      change.from,
                      t('projects.settings.hotkeys.unassigned'),
                    )}
                  </span>
                  <span class="text-muted-foreground">→</span>
                  <span class="font-medium text-foreground">
                    {getHotkeyBindingDisplayLabel(change.to, t('projects.settings.hotkeys.unassigned'))}
                  </span>
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction onclick={applyPendingImport}>
          {t('projects.settings.hotkeys.importApply')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
