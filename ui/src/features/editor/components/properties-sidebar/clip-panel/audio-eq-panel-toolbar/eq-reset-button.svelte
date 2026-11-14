<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'

  interface EqResetButtonProps {
    disabled: boolean
    onReset: () => void
    compact: boolean
  }

  /** Reset-to-flat button: labelled in the floating header, iconic when compact. */
  let { disabled, onReset, compact }: EqResetButtonProps = $props()
</script>

{#if compact}
  <Button
    variant="ghost"
    size="sm"
    class={cn(
      'h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground',
      disabled && 'opacity-40',
    )}
    onclick={onReset}
    {disabled}
    aria-label="Reset EQ"
  >
    <RotateCcw class="h-3 w-3" />
  </Button>
{:else}
  <Button
    variant="ghost"
    size="sm"
    class={cn(
      'h-8 shrink-0 px-3 text-muted-foreground hover:text-foreground',
      disabled && 'opacity-40',
    )}
    onclick={onReset}
    {disabled}
  >
    Reset EQ
  </Button>
{/if}
