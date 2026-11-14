<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Eye from 'lucide-svelte/icons/eye'
  import EyeOff from 'lucide-svelte/icons/eye-off'
  import Palette from 'lucide-svelte/icons/palette'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import { Button } from '@/components/ui/button'
  import { t } from '$lib/i18n.svelte'
  import EffectMoveButtons from '../effect-move-buttons.svelte'
  import type { EffectPanelHeaderActionsProps } from './types'

  let {
    effectId,
    enabled,
    isDefault,
    onReset,
    onToggle,
    onRemove,
    onMove,
    canMoveUp,
    canMoveDown,
    onEditInColor,
  }: EffectPanelHeaderActionsProps = $props()

  const resetLabel = $derived(t('effects.panel.resetToDefaults'))
  const toggleLabel = $derived(
    enabled ? t('effects.panel.disableEffect') : t('effects.panel.enableEffect'),
  )
  const removeLabel = $derived(t('effects.panel.removeEffect'))
  const editInColorLabel = $derived(t('effects.panel.editInColor'))
</script>

{#if onEditInColor}
  <Button
    variant="ghost"
    size="icon"
    class="h-6 w-6 flex-shrink-0"
    onclick={onEditInColor}
    title={editInColorLabel}
    aria-label={editInColorLabel}
  >
    <Palette class="w-3 h-3" />
  </Button>
{/if}
<EffectMoveButtons {effectId} {onMove} {canMoveUp} {canMoveDown} />
<Button
  variant="ghost"
  size="icon"
  class={`h-6 w-6 flex-shrink-0 ${isDefault ? 'opacity-30' : ''}`}
  onclick={() => onReset(effectId)}
  title={resetLabel}
  aria-label={resetLabel}
  disabled={isDefault}
>
  <RotateCcw class="w-3 h-3" />
</Button>
<Button
  variant="ghost"
  size="icon"
  class="h-6 w-6 flex-shrink-0"
  onclick={() => onToggle(effectId)}
  title={toggleLabel}
  aria-label={toggleLabel}
>
  {#if enabled}
    <Eye class="w-3 h-3" />
  {:else}
    <EyeOff class="w-3 h-3 text-muted-foreground" />
  {/if}
</Button>
<Button
  variant="ghost"
  size="icon"
  class="h-6 w-6 flex-shrink-0"
  onclick={() => onRemove(effectId)}
  title={removeLabel}
  aria-label={removeLabel}
>
  <Trash2 class="w-3 h-3" />
</Button>
