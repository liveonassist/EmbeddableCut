<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const PREVIEW_PREFETCH_LIMIT = 4
  const PREVIEW_PREFETCH_DEBOUNCE_MS = 120
</script>

<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import Check from '@lucide/svelte/icons/check'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import Search from '@lucide/svelte/icons/search'
  import Type from '@lucide/svelte/icons/type'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import {
    FONT_CATALOG,
    ensureFontsLoaded,
    getGoogleFontsCatalog,
    type FontCatalogEntry,
  } from '@/shared/typography/fonts'

  interface FontPickerProps {
    value?: string
    placeholder?: string
    previewText?: string
    onValueChange: (fontFamily: string) => void
  }

  let { value, placeholder, previewText, onValueChange }: FontPickerProps = $props()

  const resolvedPlaceholder = $derived(placeholder ?? t('editor.fontPicker.selectFont'))
  let root: HTMLDivElement | null = $state(null)
  let searchInput: HTMLInputElement | null = $state(null)
  const fontOptions = new Map<string, HTMLButtonElement>()
  let open = $state(false)
  let searchQuery = $state('')
  let hoveredFontValue = $state<string | null>(null)
  let fonts = $state.raw<readonly FontCatalogEntry[]>(FONT_CATALOG)
  let isLoading = $state(false)

  const closePicker = () => {
    hoveredFontValue = null
    open = false
  }

  const openPicker = () => {
    searchQuery = ''
    hoveredFontValue = null
    open = true
  }

  const togglePicker = () => {
    if (open) {
      closePicker()
      return
    }

    openPicker()
  }

  $effect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    isLoading = true

    void getGoogleFontsCatalog()
      .then((catalog) => {
        if (!cancelled) {
          fonts = catalog
        }
      })
      .finally(() => {
        if (!cancelled) {
          isLoading = false
        }
      })

    return () => {
      cancelled = true
    }
  })

  // The search field takes focus as it opens (React's `autoFocus`).
  $effect(() => {
    if (open && searchInput) searchInput.focus()
  })

  const filteredFonts = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return fonts
    }
    return fonts.filter((font) => font.label.toLowerCase().includes(query))
  })

  const normalizedPreviewText = $derived.by(() => {
    const source = previewText?.trim() ? previewText : t('editor.fontPicker.previewPangram')
    return source.replace(/\s+/g, ' ').slice(0, 72)
  })

  const activePreviewFont = $derived.by(() => {
    const activeValue = hoveredFontValue ?? value ?? filteredFonts[0]?.value
    if (!activeValue) {
      return null
    }
    return fonts.find((font) => font.value === activeValue) ?? null
  })

  const previewCandidates = $derived.by(() => {
    const candidates = [
      value,
      hoveredFontValue,
      ...filteredFonts.slice(0, PREVIEW_PREFETCH_LIMIT).map((font) => font.value),
    ].filter((font): font is string => typeof font === 'string' && font.trim().length > 0)

    return [...new Set(candidates)]
  })

  $effect(() => {
    const candidates = previewCandidates
    if (!open || candidates.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void ensureFontsLoaded(candidates, [400])
    }, PREVIEW_PREFETCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  })

  $effect(() => {
    if (!open) {
      return
    }

    const rootElement = root

    const handlePointerDown = (event: PointerEvent) => {
      // Read the composed path: a shadow-root editor retargets `target` to its host.
      const target = event.composedPath()[0] ?? event.target
      if (target instanceof Node && root && !root.contains(target)) {
        closePicker()
      }
    }

    const handleFocusOut = (event: FocusEvent) => {
      const relatedTarget = event.relatedTarget
      if (relatedTarget instanceof Node && root?.contains(relatedTarget)) {
        return
      }

      closePicker()
    }

    window.addEventListener('pointerdown', handlePointerDown)
    rootElement?.addEventListener('focusout', handleFocusOut)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      rootElement?.removeEventListener('focusout', handleFocusOut)
    }
  })

  const handleSelect = (font: FontCatalogEntry) => {
    void ensureFontsLoaded([font.value], font.weights)
    onValueChange(font.value)
    closePicker()
  }

  const focusFontByIndex = (index: number) => {
    const font = filteredFonts[index]
    if (!font) {
      return
    }

    const option = fontOptions.get(font.value)
    if (option) {
      option.focus()
    }

    hoveredFontValue = font.value
    void ensureFontsLoaded([font.value], [400])
  }

  const handleOptionKeyDown = (event: KeyboardEvent, font: FontCatalogEntry) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closePicker()
      return
    }

    if (filteredFonts.length === 0) {
      return
    }

    const currentIndex = filteredFonts.findIndex((candidate) => candidate.value === font.value)
    if (currentIndex === -1) {
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusFontByIndex((currentIndex + 1) % filteredFonts.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusFontByIndex((currentIndex - 1 + filteredFonts.length) % filteredFonts.length)
        break
      case 'Home':
        event.preventDefault()
        focusFontByIndex(0)
        break
      case 'End':
        event.preventDefault()
        focusFontByIndex(filteredFonts.length - 1)
        break
      case 'Enter':
      case ' ': {
        event.preventDefault()
        handleSelect(font)
        break
      }
      default:
        break
    }
  }

  const registerFontOption = (fontValue: string) => (node: HTMLButtonElement) => {
    fontOptions.set(fontValue, node)
    return () => {
      if (fontOptions.get(fontValue) === node) fontOptions.delete(fontValue)
    }
  }

  const triggerLabel = $derived(value ?? resolvedPlaceholder)
</script>

<div bind:this={root} class="w-full">
  <Button
    type="button"
    variant="outline"
    class="h-7 w-full justify-between px-2 text-xs font-normal"
    onclick={togglePicker}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span class="truncate" style:font-family={value ? `"${value}", sans-serif` : undefined}
      >{triggerLabel}</span
    >
    <Type class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  </Button>

  {#if open}
    <div class="mt-2 space-y-2 rounded-md border bg-popover p-2 shadow-sm">
      <div class="relative">
        <Search
          class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          bind:ref={searchInput}
          bind:value={searchQuery}
          placeholder={t('editor.fontPicker.searchFonts')}
          class="h-8 pl-9 text-xs"
        />
      </div>

      <div class="rounded-md border bg-muted/20 p-3">
        <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
          {activePreviewFont?.label ?? t('editor.fontPicker.livePreview')}
        </p>
        <p
          class="mt-1 truncate text-lg"
          style:font-family={activePreviewFont
            ? `"${activePreviewFont.family}", sans-serif`
            : undefined}
        >
          {normalizedPreviewText}
        </p>
      </div>

      <div class="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t('editor.fontPicker.allFonts')}</span>
        <span>{filteredFonts.length}</span>
      </div>

      <div
        class="max-h-52 space-y-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]"
        role="listbox"
        aria-label={t('editor.fontPicker.fontOptions')}
      >
        {#if isLoading}
          <div class="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 class="h-4 w-4 animate-spin" />
          </div>
        {:else if filteredFonts.length === 0}
          <div class="py-8 text-center text-sm text-muted-foreground">
            {t('editor.fontPicker.noMatch')}
          </div>
        {:else}
          {#each filteredFonts as font (font.value)}
            {@const isSelected = font.value === value}
            <button
              {@attach registerFontOption(font.value)}
              type="button"
              role="option"
              aria-selected={isSelected}
              onclick={() => handleSelect(font)}
              onpointerenter={() => {
                hoveredFontValue = font.value
                void ensureFontsLoaded([font.value], [400])
              }}
              onfocus={() => {
                hoveredFontValue = font.value
                void ensureFontsLoaded([font.value], [400])
              }}
              onkeydown={(event) => handleOptionKeyDown(event, font)}
              class="w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent/40"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs" style:font-family={`"${font.family}", sans-serif`}
                  >{font.label}</span
                >
                {#if isSelected}
                  <Check class="h-3.5 w-3.5 text-primary" />
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
