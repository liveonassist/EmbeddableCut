<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import { Button } from '@/components/ui/button'
  import { t } from '$lib/i18n.svelte'
  import type { EffectMoveProps } from './panel-props'

  /**
   * Up/down reorder buttons shared by all effect panel headers.
   * Effect order matters — color operations are not commutative.
   */
  let {
    effectId,
    onMove,
    canMoveUp = false,
    canMoveDown = false,
  }: EffectMoveProps & { effectId: string } = $props()

  const moveUpLabel = $derived(t('effects.panel.moveUp'))
  const moveDownLabel = $derived(t('effects.panel.moveDown'))
</script>

{#if onMove}
  <Button
    variant="ghost"
    size="icon"
    class={`h-6 w-6 flex-shrink-0 ${canMoveUp ? '' : 'opacity-30'}`}
    onclick={() => onMove(effectId, -1)}
    title={moveUpLabel}
    aria-label={moveUpLabel}
    disabled={!canMoveUp}
  >
    <ChevronUp class="w-3 h-3" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class={`h-6 w-6 flex-shrink-0 ${canMoveDown ? '' : 'opacity-30'}`}
    onclick={() => onMove(effectId, 1)}
    title={moveDownLabel}
    aria-label={moveDownLabel}
    disabled={!canMoveDown}
  >
    <ChevronDown class="w-3 h-3" />
  </Button>
{/if}
