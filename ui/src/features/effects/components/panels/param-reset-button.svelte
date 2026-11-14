<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import { Button } from '@/components/ui/button'
  import { t } from '$lib/i18n.svelte'
  import type { GpuParamValue } from './panel-props'

  interface ParamResetButtonProps {
    effectId: string
    paramKey: string
    label: string
    value: GpuParamValue
    defaultValue: GpuParamValue
    onParamChange: (effectId: string, paramKey: string, value: GpuParamValue) => void
  }

  let { effectId, paramKey, label, value, defaultValue, onParamChange }: ParamResetButtonProps =
    $props()

  const resetLabel = $derived(`${t('effects.panel.resetToDefaults')}: ${label}`)
</script>

<Button
  type="button"
  variant="ghost"
  size="icon"
  class="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
  onclick={() => onParamChange(effectId, paramKey, defaultValue)}
  title={resetLabel}
  aria-label={resetLabel}
  disabled={Object.is(value, defaultValue)}
>
  <RotateCcw class="h-3 w-3" />
</Button>
