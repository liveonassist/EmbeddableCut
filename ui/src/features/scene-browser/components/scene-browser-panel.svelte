<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import BrainCircuit from 'lucide-svelte/icons/brain-circuit'
  import Check from 'lucide-svelte/icons/check'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import Filter from 'lucide-svelte/icons/filter'
  import LayoutGrid from 'lucide-svelte/icons/layout-grid'
  import List from 'lucide-svelte/icons/list'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import Wand2 from 'lucide-svelte/icons/wand-sparkles'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import {
    importMediaAnalysisService,
    useMediaLibraryStore,
  } from '@/features/scene-browser/deps/media-library'
  import {
    useSceneBrowserStore,
    type SceneBrowserSortMode,
    type SceneBrowserViewMode,
  } from '@/features/scene-browser/stores/scene-browser-store'
  import { useRankedScenes } from '../hooks/use-ranked-scenes.svelte'
  import { useSemanticIndex } from '../hooks/use-semantic-index.svelte'
  import { SceneSearchField, SceneSearchModeButtons } from './scene-search-input'
  import { GlobalSceneRow, ScopedSceneRow } from './scene-row'
  import { GlobalSceneCard, ScopedSceneCard } from './scene-card'
  import '../utils/invalidate'

  interface SceneBrowserPanelProps {
    class?: string
  }

  type AnalyzeKind = 'missing' | 'all' | 'scope'
  type MediaRef = { id: string; fileName: string }

  const SORT_OPTIONS: Array<{ value: SceneBrowserSortMode; labelKey: string }> = [
    { value: 'relevance', labelKey: 'sceneBrowser.sort.relevance' },
    { value: 'time', labelKey: 'sceneBrowser.sort.time' },
    { value: 'name', labelKey: 'sceneBrowser.sort.name' },
  ]

  let { class: className }: SceneBrowserPanelProps = $props()

  const query = select(useSceneBrowserStore, (s) => s.query)
  const scope = select(useSceneBrowserStore, (s) => s.scope)
  const sortMode = select(useSceneBrowserStore, (s) => s.sortMode)
  const viewMode = select(useSceneBrowserStore, (s) => s.viewMode)

  const mediaItems = select(useMediaLibraryStore, (s) => s.mediaItems)
  const mediaWithCaptions = $derived(
    mediaItems.current.filter((m) => (m.aiCaptions?.length ?? 0) > 0),
  )

  let analyzeBusy = $state(false)
  const analyzableMedia = $derived(
    mediaItems.current.filter(
      (m) => m.mimeType.startsWith('video/') || m.mimeType.startsWith('image/'),
    ),
  )
  const missingCount = $derived(
    analyzableMedia.filter((m) => (m.aiCaptions?.length ?? 0) === 0).length,
  )

  let header = $state<HTMLDivElement | null>(null)
  let headerWidth = $state<number>(Number.POSITIVE_INFINITY)
  $effect(() => {
    const el = header
    if (!el) return
    const update = () => {
      headerWidth = el.clientWidth
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  })

  // Two thresholds for compacting — buttons (Color/Keyword/Analyze) carry
  // fixed-width labels and only need to collapse when genuinely cramped,
  // but the scope `<Select>` shows arbitrary-length filenames in a 144px
  // pill, so we collapse it earlier and much earlier when a specific
  // media is picked (any real filename truncates in that width).
  const compact = $derived(headerWidth < 360)
  const compactScope = $derived(
    headerWidth < 440 || (scope.current !== null && headerWidth < 560),
  )

  async function runAnalyze(kind: AnalyzeKind, mediaId?: string) {
    if (analyzeBusy) return
    analyzeBusy = true
    try {
      const { mediaAnalysisService } = await importMediaAnalysisService()
      if (kind === 'scope' && mediaId) {
        await mediaAnalysisService.analyzeMedia(mediaId)
      } else if (kind === 'missing') {
        await mediaAnalysisService.analyzeBatch({ onlyMissing: true })
      } else {
        await mediaAnalysisService.analyzeBatch({ onlyMissing: false })
      }
    } finally {
      analyzeBusy = false
    }
  }

  const ranked = useRankedScenes()
  const indexProgress = useSemanticIndex()

  const scopedMedia = $derived(
    scope.current ? (mediaWithCaptions.find((m) => m.id === scope.current) ?? null) : null,
  )

  function handleScopeChange(value: string) {
    useSceneBrowserStore.getState().setScope(value === 'all' ? null : value)
  }

  const setViewMode = (mode: SceneBrowserViewMode) =>
    useSceneBrowserStore.getState().setViewMode(mode)

  const scenes = $derived(ranked.current.scenes)
  const hasAnyCaptions = $derived(ranked.current.totalScenes > 0)
  const hasResults = $derived(scenes.length > 0)
  const isFiltered = $derived(query.current.trim().length > 0)
  const SceneGridCard = $derived(scope.current === null ? GlobalSceneCard : ScopedSceneCard)
  const SceneListRow = $derived(scope.current === null ? GlobalSceneRow : ScopedSceneRow)

  const scopeLabel = $derived(
    `${t('sceneBrowser.counts.clip', {
      count: ranked.current.clipsWithCaptions,
    })} · ${t('sceneBrowser.counts.scene', { count: ranked.current.totalScenes })}`,
  )

  /** Splits a translation around its `<tag>…</tag>` markup, as react-i18next's `Trans` renders it. */
  function splitTag(text: string, tag: string): [string, string, string] {
    const match = new RegExp(`^([\\s\\S]*)<${tag}>([\\s\\S]*)</${tag}>([\\s\\S]*)$`).exec(text)
    return match ? [match[1]!, match[2]!, match[3]!] : [text, '', '']
  }
</script>

{#snippet semanticIndexBanner(progress: {
  indexing: number
  indexTotal: number
  loadingModel: boolean
})}
  {@const label = progress.loadingModel
    ? t('sceneBrowser.banners.downloadingSemanticModel')
    : t('sceneBrowser.banners.indexingCaptions', {
        current: progress.indexing,
        total: progress.indexTotal,
      })}
  <div
    class="flex items-center gap-2 rounded-md border border-purple-400/20 bg-purple-400/5 px-3 py-2 text-[11px] text-purple-300/90"
  >
    <BrainCircuit class="h-3 w-3 shrink-0 animate-pulse" />
    <span class="truncate">{label}</span>
  </div>
{/snippet}

{#snippet reanalyzingBanner(items: MediaRef[])}
  {@const label =
    items.length === 1 ? items[0]!.fileName : t('sceneBrowser.counts.clip', { count: items.length })}
  {@const [before, strong, after] = splitTag(
    t('sceneBrowser.banners.reanalyzing', { label }),
    'strong',
  )}
  <div
    class="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary/90"
  >
    <Loader2 class="h-3 w-3 shrink-0 animate-spin" />
    <span class="truncate">{before}<span class="font-medium">{strong}</span>{after}</span>
  </div>
{/snippet}

<!--
  Compact replacement for the scope `<Select>` used when the browser header
  is too narrow to fit the full pill. Renders a small filter-icon button
  (with a dot when a specific clip is scoped) that opens a dropdown listing
  "All media" + every captioned clip.
-->
{#snippet compactScopePicker()}
  {@const title = scopedMedia
    ? t('sceneBrowser.scope.scopedTo', { name: scopedMedia.fileName })
    : t('sceneBrowser.scope.scopedToAll')}
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class={cn(
            'relative flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors',
            scope.current
              ? 'border-primary/60 bg-primary/10 text-primary'
              : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
          )}
          {title}
          aria-label={title}
        >
          <Filter class="h-3 w-3" />
          <ChevronDown class="h-3 w-3 opacity-70" />
          {#if scope.current}
            <span class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary"></span>
          {/if}
        </button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-64">
      <DropdownMenuItem onSelect={() => handleScopeChange('all')}>
        {t('sceneBrowser.scope.allMedia')}
        {#if scope.current === null}
          <Check class="ml-auto h-3 w-3" />
        {/if}
      </DropdownMenuItem>
      {#if mediaWithCaptions.length > 0}
        <DropdownMenuSeparator />
      {/if}
      {#each mediaWithCaptions as media (media.id)}
        <DropdownMenuItem onSelect={() => handleScopeChange(media.id)}>
          <span class="truncate">{media.fileName}</span>
          {#if scope.current === media.id}
            <Check class="ml-auto h-3 w-3 shrink-0" />
          {/if}
        </DropdownMenuItem>
      {/each}
    </DropdownMenuContent>
  </DropdownMenu>
{/snippet}

{#snippet analyzeMenu()}
  {@const disabled = analyzableMedia.length === 0}
  <DropdownMenu>
    <DropdownMenuTrigger disabled={disabled || analyzeBusy}>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class={cn(
            'flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors',
            'border-border bg-secondary text-muted-foreground hover:text-foreground',
            (disabled || analyzeBusy) && 'cursor-not-allowed opacity-60',
          )}
          title={t('sceneBrowser.analyze.title')}
          aria-label={t('sceneBrowser.analyze.title')}
        >
          {#if analyzeBusy}
            <Loader2 class="h-3 w-3 animate-spin" />
          {:else}
            <Wand2 class="h-3 w-3" />
          {/if}
          {#if !compact}
            {t('sceneBrowser.analyze.button')}
          {/if}
          <ChevronDown class="h-3 w-3 opacity-70" />
        </button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-64">
      {#if scopedMedia}
        {@const media = scopedMedia}
        <DropdownMenuItem onSelect={() => void runAnalyze('scope', media.id)}>
          <Sparkles class="mr-2 h-3 w-3" />
          <span class="truncate">
            {t('sceneBrowser.analyze.scope', { name: media.fileName })}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      {/if}
      <DropdownMenuItem onSelect={() => void runAnalyze('missing')} disabled={missingCount === 0}>
        <Sparkles class="mr-2 h-3 w-3" />
        {t('sceneBrowser.analyze.newMedia')}
        <span class="ml-auto text-[10px] text-muted-foreground">
          {t('sceneBrowser.counts.clip', { count: missingCount })}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => void runAnalyze('all')}
        disabled={analyzableMedia.length === 0}
      >
        <Wand2 class="mr-2 h-3 w-3" />
        {t('sceneBrowser.analyze.reanalyzeAll')}
        <span class="ml-auto text-[10px] text-muted-foreground">
          {t('sceneBrowser.counts.clip', { count: analyzableMedia.length })}
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
{/snippet}

{#snippet viewModeToggle(value: SceneBrowserViewMode)}
  <div class="flex items-center rounded-md border border-border bg-secondary p-0.5">
    <button
      type="button"
      onclick={() => setViewMode('list')}
      class={cn(
        'flex h-5 w-5 items-center justify-center rounded-[3px] transition-colors',
        value === 'list'
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground',
      )}
      title={t('sceneBrowser.view.list')}
      aria-label={t('sceneBrowser.view.list')}
      aria-pressed={value === 'list'}
    >
      <List class="h-3 w-3" />
    </button>
    <button
      type="button"
      onclick={() => setViewMode('grid')}
      class={cn(
        'flex h-5 w-5 items-center justify-center rounded-[3px] transition-colors',
        value === 'grid'
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground',
      )}
      title={t('sceneBrowser.view.grid')}
      aria-label={t('sceneBrowser.view.grid')}
      aria-pressed={value === 'grid'}
    >
      <LayoutGrid class="h-3 w-3" />
    </button>
  </div>
{/snippet}

{#snippet emptyState()}
  {#if !hasAnyCaptions}
    <div
      class="flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground"
    >
      <Sparkles class="h-6 w-6 text-purple-400/60" />
      <p class="text-[12px]">{t('sceneBrowser.empty.noCaptionsTitle')}</p>
      <p class="max-w-xs text-[11px] text-muted-foreground/80">
        {t('sceneBrowser.empty.noCaptionsPrefix')}
        <span class="font-medium">{t('sceneBrowser.analyze.title')}</span>
        {t('sceneBrowser.empty.noCaptionsSuffix')}
      </p>
    </div>
  {:else if isFiltered}
    <div
      class="flex flex-col items-center gap-1 px-6 py-10 text-center text-muted-foreground"
    >
      <p class="text-[12px]">{t('sceneBrowser.empty.noMatchesTitle')}</p>
      <p class="text-[11px] text-muted-foreground/80">
        {t('sceneBrowser.empty.noMatchesPrefix')}
        <span class="font-medium">{t('sceneBrowser.scope.allMedia')}</span>.
      </p>
    </div>
  {/if}
{/snippet}

<div class={cn('flex min-h-0 flex-col', className)}>
  <div bind:this={header} class="flex flex-col gap-2 border-b border-border/50 px-3 py-2">
    <div class="flex items-center gap-2">
      <SceneSearchModeButtons {compact} />
      {@render analyzeMenu()}
      <div class="flex-1"></div>
      {#if compactScope}
        {@render compactScopePicker()}
      {:else}
        <Select value={scope.current ?? 'all'} onValueChange={handleScopeChange}>
          <SelectTrigger class="h-6 w-36 text-[11px]">
            <SelectValue placeholder={t('sceneBrowser.scope.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('sceneBrowser.scope.allMedia')}</SelectItem>
            {#each mediaWithCaptions as media (media.id)}
              <SelectItem value={media.id}>
                {media.fileName}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      {/if}
    </div>
    <div class="flex items-center">
      <SceneSearchField />
    </div>
  </div>

  <div
    class="flex items-center justify-between border-b border-border/30 px-3 py-1.5 text-[11px] text-muted-foreground"
  >
    <span class="flex items-center gap-1.5">
      <Sparkles class="h-3 w-3 text-purple-400" />
      {isFiltered
        ? `${t('sceneBrowser.counts.match', { count: scenes.length })} · ${scopeLabel}`
        : scopeLabel}
    </span>
    <div class="flex items-center gap-1.5">
      {@render viewModeToggle(viewMode.current)}
      <span class="text-muted-foreground/80">{t('sceneBrowser.sort.label')}</span>
      <Select
        value={sortMode.current}
        onValueChange={(v) => useSceneBrowserStore.getState().setSortMode(v as SceneBrowserSortMode)}
      >
        <SelectTrigger class="h-6 w-28 text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {#each SORT_OPTIONS as option (option.value)}
            <SelectItem value={option.value}>
              {t(option.labelKey)}
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </div>
  </div>

  <!-- The `[&>...]` override forces the inner viewport wrapper to block
       layout. Left to its default, the wrapper can grow past the viewport
       width if any row has a long intrinsic min-width — that overflow slides
       row content underneath the vertical scrollbar. Block layout keeps the
       wrapper clamped to viewport width so the scrollbar sits in its own
       column. -->
  <ScrollArea class="flex-1 min-h-0 mr-2 [&>[data-scroll-area-viewport]>div]:!block">
    <div class={cn('pl-2 pr-3 py-2', viewMode.current === 'list' && 'space-y-0.5')}>
      {#if ranked.current.reanalyzingMedia.length > 0}
        {@render reanalyzingBanner(ranked.current.reanalyzingMedia)}
      {/if}
      {#if indexProgress.current.indexTotal > 0 || indexProgress.current.loadingModel}
        {@render semanticIndexBanner(indexProgress.current)}
      {/if}
      {#if hasResults}
        {#if viewMode.current === 'grid'}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {#each scenes as scene, index (scene.id)}
              <SceneGridCard
                {scene}
                match={ranked.current.isQuerying
                  ? { rank: index === 0 ? 'top' : 'default' }
                  : undefined}
              />
            {/each}
          </div>
        {:else}
          {#each scenes as scene, index (scene.id)}
            <SceneListRow
              {scene}
              match={ranked.current.isQuerying
                ? { rank: index === 0 ? 'top' : 'default' }
                : undefined}
            />
          {/each}
        {/if}
      {:else if ranked.current.reanalyzingMedia.length === 0}
        {@render emptyState()}
      {/if}
    </div>
  </ScrollArea>
</div>
