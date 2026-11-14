<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import ChevronLeft from 'lucide-svelte/icons/chevron-left'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import Search from 'lucide-svelte/icons/search'
  import X from 'lucide-svelte/icons/x'
  import { Input } from '@/components/ui/input'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import type { LottieBrowseCategory } from '@/features/lottie-browser/services/lottiefiles-api'
  import {
    LOTTIE_PAGE_SIZE,
    useLottieBrowserStore,
  } from '@/features/lottie-browser/stores/lottie-browser-store'
  import LottieCard from './lottie-card.svelte'

  const CATEGORIES: LottieBrowseCategory[] = ['featured', 'popular', 'recent']

  const category = select(useLottieBrowserStore, (s) => s.category)
  const query = select(useLottieBrowserStore, (s) => s.query)
  const items = select(useLottieBrowserStore, (s) => s.items)
  const status = select(useLottieBrowserStore, (s) => s.status)
  const error = select(useLottieBrowserStore, (s) => s.error)
  const page = select(useLottieBrowserStore, (s) => s.page)
  const totalCount = select(useLottieBrowserStore, (s) => s.totalCount)
  const hasFetched = select(useLottieBrowserStore, (s) => s.hasFetched)
  const importingIds = select(useLottieBrowserStore, (s) => s.importingIds)
  const importedIds = select(useLottieBrowserStore, (s) => s.importedIds)
  const failedIds = select(useLottieBrowserStore, (s) => s.failedIds)

  const store = () => useLottieBrowserStore.getState()

  let inputValue = $state(untrack(() => query.current))
  const isSearching = $derived(inputValue.trim().length > 0)

  // Editable page number. Mirrors the store's page; typing + Enter/blur jumps.
  let pageInput = $state('1')

  // Debounce the search box into the committed query.
  $effect(() => {
    const value = inputValue.trim()
    const id = window.setTimeout(() => store().setQuery(value), 300)
    return () => window.clearTimeout(id)
  })

  // (Re)load from page 1 whenever the feed or committed query changes — also
  // runs on mount.
  $effect(() => {
    void category.current
    void query.current
    untrack(() => void store().refresh())
  })

  // Jump the scroll position back to the top on every page change.
  let scroll = $state<HTMLDivElement | null>(null)
  $effect(() => {
    void page.current
    untrack(() => scroll)?.scrollTo({ top: 0 })
  })

  const totalPages = $derived(Math.max(1, Math.ceil(totalCount.current / LOTTIE_PAGE_SIZE)))

  // Keep the editable field in sync when the page changes elsewhere (arrows,
  // new search, etc).
  $effect(() => {
    pageInput = String(page.current + 1)
  })

  function commitPageInput() {
    const parsed = Number.parseInt(pageInput, 10)
    if (Number.isFinite(parsed)) {
      const targetIndex = Math.min(Math.max(parsed, 1), totalPages) - 1
      if (targetIndex !== page.current) {
        void store().goToPage(targetIndex)
        return
      }
    }
    // Invalid or unchanged — restore the current page number.
    pageInput = String(page.current + 1)
  }

  const isLoading = $derived(status.current === 'loading')
  // Treat the render before the first fetch resolves as loading so the empty
  // state never flashes on mount (store starts idle with no items).
  const isInitialLoading = $derived(
    (isLoading || !hasFetched.current) && items.current.length === 0,
  )
  const showEmpty = $derived(
    hasFetched.current && status.current === 'idle' && totalCount.current === 0,
  )
  const showGrid = $derived(items.current.length > 0 && status.current !== 'error')
  // Driven by totalPages, not the current page's item count: a page that maps
  // to no importable items still needs the pager so the user can move on.
  const showPager = $derived(status.current !== 'error' && totalPages > 1)
  const canPrev = $derived(page.current > 0 && !isLoading)
  const canNext = $derived(page.current < totalPages - 1 && !isLoading)

  /** The attribution note around its `<license>…</license>` link, as react-i18next's `Trans` splits it. */
  const attribution = $derived.by(() => {
    const text = t('lottieBrowser.attributionNote')
    const match = /^([\s\S]*)<license>([\s\S]*)<\/license>([\s\S]*)$/.exec(text)
    return match ? [match[1]!, match[2]!, match[3]!] : [text, '', '']
  })
</script>

<div class="flex h-full flex-col">
  <!-- Search + feed controls -->
  <div class="flex flex-col gap-2 border-b border-border p-3">
    <div class="relative">
      <Search
        class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        bind:value={inputValue}
        placeholder={t('lottieBrowser.searchPlaceholder')}
        class="h-8 pl-8 pr-8 text-xs"
      />
      {#if inputValue.length > 0}
        <button
          type="button"
          onclick={() => (inputValue = '')}
          aria-label={t('lottieBrowser.clearSearch')}
          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      {/if}
    </div>

    {#if !isSearching}
      <div class="flex gap-1">
        {#each CATEGORIES as id (id)}
          <button
            type="button"
            onclick={() => store().setCategory(id)}
            class={cn(
              'rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors',
              category.current === id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            {t(`lottieBrowser.categories.${id}`)}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Results -->
  <div bind:this={scroll} class="min-h-0 flex-1 overflow-y-auto p-3">
    {#if isInitialLoading}
      <div class="flex h-24 items-center justify-center text-muted-foreground">
        <Loader2 class="h-5 w-5 animate-spin" />
      </div>
    {/if}

    {#if status.current === 'error'}
      <div class="flex flex-col items-center gap-2 py-8 text-center">
        <p class="text-xs text-muted-foreground">{error.current ?? t('lottieBrowser.error')}</p>
        <button
          type="button"
          onclick={() => void store().refresh()}
          class="rounded-md bg-secondary px-3 py-1 text-xs font-medium text-foreground hover:bg-secondary/80"
        >
          {t('lottieBrowser.retry')}
        </button>
      </div>
    {/if}

    {#if showEmpty}
      <p class="py-8 text-center text-xs text-muted-foreground">
        {t('lottieBrowser.empty')}
      </p>
    {/if}

    {#if showGrid}
      <div class={cn('grid grid-cols-2 gap-3 transition-opacity', isLoading && 'opacity-60')}>
        {#each items.current as animation (animation.id)}
          <LottieCard
            {animation}
            isImporting={importingIds.current.has(animation.id)}
            isImported={importedIds.current.has(animation.id)}
            isFailed={failedIds.current.has(animation.id)}
            onImport={(next) => store().importAnimation(next)}
          />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Pager -->
  {#if showPager}
    <div class="flex items-center justify-between border-t border-border px-3 py-1.5">
      <button
        type="button"
        onclick={() => void store().goToPage(page.current - 1)}
        disabled={!canPrev}
        aria-label={t('lottieBrowser.previous')}
        class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft class="h-4 w-4" />
      </button>
      <span class="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
        {#if isLoading}
          <Loader2 class="h-3 w-3 animate-spin" />
        {/if}
        <input
          type="text"
          inputmode="numeric"
          value={pageInput}
          oninput={(event) => {
            const next = event.currentTarget.value.replace(/[^0-9]/g, '')
            pageInput = next
            // A controlled React input rejects the stripped characters; mirror that.
            event.currentTarget.value = next
          }}
          onfocus={(event) => event.currentTarget.select()}
          onkeydown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          onblur={commitPageInput}
          aria-label={t('lottieBrowser.goToPage')}
          class="h-6 w-11 rounded border border-input bg-transparent text-center text-[11px] tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {t('lottieBrowser.ofTotal', { total: totalPages })}
      </span>
      <button
        type="button"
        onclick={() => void store().goToPage(page.current + 1)}
        disabled={!canNext}
        aria-label={t('lottieBrowser.next')}
        class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
  {/if}

  <!-- Attribution / licensing note -->
  <div class="border-t border-border px-3 py-2">
    <p class="text-[10px] leading-tight text-muted-foreground">
      {attribution[0]}<a
        href="https://lottiefiles.com/page/license"
        target="_blank"
        rel="noreferrer"
        class="underline underline-offset-2 hover:text-foreground">{attribution[1]}</a
      >{attribution[2]}
    </p>
  </div>
</div>
