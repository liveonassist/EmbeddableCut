<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import type { AnimationPreset } from '@/infrastructure/storage'
  import { Button } from '@/components/ui/button'
  import { Separator } from '@/components/ui/separator'
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
  import { cn } from '@/shared/ui/cn'

  interface SavedAnimationListProps {
    /** Every saved preset (an empty list renders the empty-state copy). */
    presets: AnimationPreset[]
    /** Presets surviving the search / compatible-only filters. */
    visiblePresets: AnimationPreset[]
    filtersActive: boolean
    /** Whether any preset, modulator or text-motion row matches the filters. */
    hasVisibleResults: boolean
    reasonFor: (preset: AnimationPreset) => string | null
    onApply: (preset: AnimationPreset) => void
    onDelete: (preset: AnimationPreset) => void
    t: (key: string, options?: Record<string, unknown>) => string
  }

  /**
   * The no-match notice, separator and saved-animation list that close the
   * library's scroll area. Filtering hides the saved section entirely (its
   * presets are not part of the built-in catalogue the user is searching).
   */
  let {
    presets,
    visiblePresets,
    filtersActive,
    hasVisibleResults,
    reasonFor,
    onApply,
    onDelete,
    t,
  }: SavedAnimationListProps = $props()

  const showList = $derived(!filtersActive || visiblePresets.length > 0)
</script>

{#if !hasVisibleResults && filtersActive}
  <div
    class="rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground"
    role="status"
  >
    {t('editor.animatePresets.noMatches')}
  </div>
{/if}

{#if showList}
  <Separator />

  <!-- ── Saved animations — user-captured presets, also declarative ── -->
  <section class="flex flex-col gap-1">
    <h3 class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {t('editor.animatePresets.animationsHeading')}
    </h3>
    {#if presets.length === 0}
      <p class="text-xs text-muted-foreground">{t('editor.animatePresets.empty')}</p>
    {:else}
      {#each visiblePresets as preset (preset.id)}
        {@const reason = reasonFor(preset)}
        {@const disabled = reason !== null}
        <div class="group flex items-center gap-1 rounded-md border border-border/60">
          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  aria-disabled={disabled}
                  onclick={() => {
                    if (!disabled) onApply(preset)
                  }}
                  class={cn(
                    'min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                    disabled ? 'cursor-not-allowed text-muted-foreground/60' : 'hover:bg-secondary/40',
                  )}
                >
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span class="min-w-0 flex-1 truncate">{preset.name}</span>
                    {#if preset.motionModifiers?.length || preset.textMotion}
                      <span
                        class="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary"
                        title={t('editor.animateStages.liveBadge')}
                      >
                        ƒx
                      </span>
                    {/if}
                  </span>
                </button>
              {/snippet}
            </TooltipTrigger>
            {#if reason}<TooltipContent>{reason}</TooltipContent>{/if}
          </Tooltip>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            aria-label={t('editor.animatePresets.deleteLabel')}
            onclick={() => void onDelete(preset)}
          >
            <Trash2 class="h-3 w-3" />
          </Button>
        </div>
      {/each}
    {/if}
  </section>
{/if}
