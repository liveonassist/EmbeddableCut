<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import MoreHorizontal from 'lucide-svelte/icons/ellipsis'
  import Palette from 'lucide-svelte/icons/palette'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { useLibraryPalette } from '../hooks/use-library-palette.svelte'
  import { useSceneBrowserStore } from '@/features/scene-browser/stores/scene-browser-store'
  import { labToRgb } from '@/features/scene-browser/utils/color-convert'

  /**
   * Color Mode picker — a weighted-k-means grid of the library's actual
   * dominant colors. Clicking a swatch pins it as a single-entry reference
   * palette, which the existing ranker turns into a similarity search.
   *
   * The grid caps at two visible rows. When more swatches exist than fit,
   * the tail collapses behind a "+N" button that opens a flyout containing
   * every cluster. The auto-fill track sizing keeps the visible rows tidy
   * at any container width; the overflow button always occupies the last
   * grid cell so the rows stay aligned.
   */

  interface LibraryPaletteGridProps {
    scope: string | null
    class?: string
  }

  const SWATCH_SIZE_PX = 22
  const GAP_PX = 4
  const MAX_ROWS = 2

  interface Cluster {
    l: number
    a: number
    b: number
    weight: number
  }

  let { scope, class: className }: LibraryPaletteGridProps = $props()

  const clusters = useLibraryPalette(() => scope)
  const currentRef = select(useSceneBrowserStore, (s) => s.reference)

  let container = $state<HTMLDivElement | null>(null)
  let columns = $state(0)

  $effect(() => {
    const el = container
    if (!el) return
    const update = () => {
      const width = el.clientWidth
      if (width <= 0) return
      // Match the grid's auto-fill math: floor((W + gap) / (size + gap)).
      columns = Math.max(1, Math.floor((width + GAP_PX) / (SWATCH_SIZE_PX + GAP_PX)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  })

  function handlePick(cluster: Cluster) {
    const { setQuery, setReference } = useSceneBrowserStore.getState()
    setQuery('')
    setReference({
      sceneId: `library-color-${Math.round(cluster.l)}-${Math.round(cluster.a)}-${Math.round(cluster.b)}`,
      label: t('sceneBrowser.palette.libraryColor'),
      palette: [{ l: cluster.l, a: cluster.a, b: cluster.b, weight: 1 }],
    })
  }

  function isActiveRef(
    cluster: Cluster,
    ref: { palette: ReadonlyArray<{ l: number; a: number; b: number }> } | null,
  ): boolean {
    if (!ref || ref.palette.length !== 1) return false
    const first = ref.palette[0]!
    return first.l === cluster.l && first.a === cluster.a && first.b === cluster.b
  }

  const totalWeight = $derived(clusters.current.reduce((sum, c) => sum + c.weight, 0) || 1)
  const capacity = $derived(columns > 0 ? columns * MAX_ROWS : clusters.current.length)
  const overflow = $derived(columns > 0 && clusters.current.length > capacity)
  // Reserve the last cell for the "more" button when overflowing so rows
  // stay aligned. Otherwise show every cluster.
  const visibleCount = $derived(overflow ? capacity - 1 : clusters.current.length)
  const visible = $derived(clusters.current.slice(0, visibleCount))
  const hidden = $derived(overflow ? clusters.current.slice(visibleCount) : [])
  const gridStyle = `grid-template-columns: repeat(auto-fill, minmax(${SWATCH_SIZE_PX}px, 1fr)); gap: ${GAP_PX}px`
</script>

{#snippet swatchButton(cluster: Cluster)}
  {@const [r, g, b] = labToRgb(cluster.l, cluster.a, cluster.b)}
  {@const label = t('sceneBrowser.palette.findColor', {
    percent: Math.round((cluster.weight / totalWeight) * 100),
  })}
  <button
    type="button"
    onclick={() => handlePick(cluster)}
    class={cn(
      'aspect-square rounded-md border border-white/10 transition-[transform,box-shadow,color] duration-150',
      'hover:-translate-y-0.5 active:translate-y-0 hover:shadow-md focus-visible:outline-none',
      'focus-visible:ring-2 focus-visible:ring-primary',
      isActiveRef(cluster, currentRef.current) && 'ring-2 ring-primary',
    )}
    style:background-color="rgb({r}, {g}, {b})"
    title={label}
    aria-label={label}
  ></button>
{/snippet}

{#if clusters.current.length === 0}
  <div
    class={cn(
      'flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-[12px] text-muted-foreground',
      className,
    )}
  >
    <Palette class="h-3.5 w-3.5" />
    <span>{t('sceneBrowser.palette.empty')}</span>
  </div>
{:else}
  <div bind:this={container} class={cn('grid w-full', className)} style={gridStyle}>
    {#each visible as cluster, i (`v-${i}`)}
      {@render swatchButton(cluster)}
    {/each}
    {#if overflow}
      <Popover>
        <PopoverTrigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class={cn(
                'flex aspect-square items-center justify-center rounded-md border border-white/10',
                'bg-secondary/60 text-muted-foreground transition-[transform,box-shadow,color] duration-150',
                'hover:-translate-y-0.5 active:translate-y-0 hover:text-foreground hover:shadow-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
              title={t('sceneBrowser.palette.moreColors', { count: hidden.length })}
              aria-label={t('sceneBrowser.palette.showMoreColors', { count: hidden.length })}
            >
              <MoreHorizontal class="h-3 w-3" />
            </button>
          {/snippet}
        </PopoverTrigger>
        <PopoverContent align="end" class="w-64 p-2">
          <div
            class="mb-1.5 flex items-center justify-between px-1 text-[10.5px] uppercase tracking-wide text-muted-foreground"
          >
            <span>{t('sceneBrowser.palette.moreColorsTitle')}</span>
            <span>{hidden.length}</span>
          </div>
          <div class="grid" style={gridStyle}>
            {#each hidden as cluster, i (`h-${i}`)}
              {@render swatchButton(cluster)}
            {/each}
          </div>
        </PopoverContent>
      </Popover>
    {/if}
  </div>
{/if}
