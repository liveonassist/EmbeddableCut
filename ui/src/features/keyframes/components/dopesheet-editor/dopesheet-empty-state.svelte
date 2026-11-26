<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Timer from '@lucide/svelte/icons/timer'
  import Waves from '@lucide/svelte/icons/waves'
  import { t } from '$lib/i18n.svelte'

  interface DopesheetEmptyStateProps {
    showGuidance: boolean
    fallbackMessage: string
    /** Shown when the clip has procedural motion (modulators/audio pulse) but no
     *  keyframes — explains why the sheet is empty even though it's animated.
     *  Takes precedence over `showGuidance`: when set, the procedural hint is
     *  rendered instead of the default guidance/fallback UI. */
    proceduralHint?: string
  }

  let { showGuidance, fallbackMessage, proceduralHint }: DopesheetEmptyStateProps = $props()
</script>

<!-- Procedural hint overrides both the guidance and fallback branches below. -->
{#if proceduralHint}
  <div
    data-testid="dopesheet-empty-state-procedural"
    class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
  >
    <Waves class="h-4 w-4 text-primary" aria-hidden="true" />
    <p class="max-w-sm text-xs text-muted-foreground">{proceduralHint}</p>
  </div>
{:else if !showGuidance}
  <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
    {fallbackMessage}
  </div>
{:else}
  <div
    data-testid="dopesheet-empty-state-guidance"
    class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
  >
    <p class="text-sm font-medium text-foreground/90">
      {t('timeline.keyframeEditor.emptyState.title')}
    </p>
    <p class="max-w-sm text-xs text-muted-foreground">
      {t('timeline.keyframeEditor.emptyState.intro')}
    </p>
    <ul class="max-w-sm space-y-1 text-left text-xs text-muted-foreground">
      <li>{t('timeline.keyframeEditor.emptyState.hintValue')}</li>
      <li>{t('timeline.keyframeEditor.emptyState.hintDiamond')}</li>
      <li class="flex items-start gap-1">
        <Timer class="mt-px h-3 w-3 flex-shrink-0" />
        <span>{t('timeline.keyframeEditor.emptyState.hintAutoKey')}</span>
      </li>
    </ul>
  </div>
{/if}
