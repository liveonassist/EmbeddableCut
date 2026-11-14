<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Palette from 'lucide-svelte/icons/palette'
  import Search from 'lucide-svelte/icons/search'
  import X from 'lucide-svelte/icons/x'
  import { Input } from '@/components/ui/input'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { useSettingsStore } from '@/features/scene-browser/deps/settings'
  import { useSceneBrowserStore } from '@/features/scene-browser/stores/scene-browser-store'
  import LibraryPaletteGrid from '../library-palette-grid.svelte'

  /**
   * Row-2 input surface: text search when in caption-search mode, palette
   * grid when in color mode. Sized to fill the browser header's second
   * row on its own.
   */

  const query = select(useSceneBrowserStore, (s) => s.query)
  const focusNonce = select(useSceneBrowserStore, (s) => s.focusNonce)
  const reference = select(useSceneBrowserStore, (s) => s.reference)
  const colorMode = select(useSceneBrowserStore, (s) => s.colorMode)
  const scope = select(useSceneBrowserStore, (s) => s.scope)
  const captionSearchMode = select(useSettingsStore, (s) => s.captionSearchMode)
  let input = $state<HTMLInputElement | null>(null)

  $effect(() => {
    if (focusNonce.current > 0) {
      input?.focus()
      input?.select()
    }
  })

  const semanticActive = $derived(captionSearchMode.current === 'semantic')

  const setQuery = (value: string) => useSceneBrowserStore.getState().setQuery(value)
  const clearReference = () => useSceneBrowserStore.getState().setReference(null)
</script>

{#if colorMode.current}
  <div
    class="flex min-w-0 flex-1 items-start gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5"
  >
    {#if reference.current}
      <button
        type="button"
        onclick={clearReference}
        class="flex h-6 max-w-[220px] items-center gap-1 rounded-md border border-primary/60 bg-primary/10 px-2 text-[11px] text-primary transition-colors hover:bg-primary/20"
        title={t('sceneBrowser.search.clearReference')}
      >
        <Palette class="h-3 w-3 shrink-0" />
        <span class="truncate">{reference.current.label}</span>
        <X class="h-3 w-3 shrink-0" />
      </button>
    {:else}
      <LibraryPaletteGrid scope={scope.current} />
    {/if}
  </div>
{:else}
  <div class="relative flex min-w-0 flex-1 items-center gap-1.5">
    <div class="relative flex-1 min-w-0">
      <Search
        class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        bind:ref={input}
        bind:value={() => query.current, setQuery}
        placeholder={reference.current
          ? t('sceneBrowser.search.findingSimilarPalette')
          : semanticActive
            ? t('sceneBrowser.search.semanticPlaceholder')
            : t('sceneBrowser.search.keywordPlaceholder')}
        disabled={!!reference.current}
        class="h-8 pl-8 pr-7 text-[12px] disabled:opacity-60"
        spellcheck={false}
        autocomplete="off"
      />
      {#if query.current.length > 0 && !reference.current}
        <button
          type="button"
          onclick={() => setQuery('')}
          class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t('sceneBrowser.search.clearSearch')}
        >
          <X class="h-3 w-3" />
        </button>
      {/if}
    </div>
    {#if reference.current}
      <button
        type="button"
        onclick={clearReference}
        class="flex h-8 max-w-[220px] items-center gap-1 rounded-md border border-primary/60 bg-primary/10 px-2 text-[11px] text-primary transition-colors hover:bg-primary/20"
        title={t('sceneBrowser.search.similarPaletteTo', { label: reference.current.label })}
      >
        <Palette class="h-3 w-3 shrink-0" />
        <span class="truncate">{reference.current.label}</span>
        <X class="h-3 w-3 shrink-0" />
      </button>
    {/if}
  </div>
{/if}
