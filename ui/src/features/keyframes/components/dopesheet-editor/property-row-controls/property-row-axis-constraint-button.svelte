<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Link2 from 'lucide-svelte/icons/link-2'
  import Unlink2 from 'lucide-svelte/icons/unlink-2'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { PropertyRowAxisConstraintButtonProps } from './types'

  let { axisConstraint, visible, disabled, rowLocked }: PropertyRowAxisConstraintButtonProps =
    $props()
</script>

{#if visible && axisConstraint}
  <Button
    type="button"
    variant="ghost"
    size="sm"
    class={cn(
      MINI_ICON_BUTTON_CLASS,
      'ml-0.5 self-center text-muted-foreground hover:text-foreground',
      axisConstraint.constrained && 'text-orange-400 hover:text-orange-300',
    )}
    onclick={(event) => {
      event.stopPropagation()
      axisConstraint.onChange(!axisConstraint.constrained)
    }}
    disabled={disabled || rowLocked}
    title={axisConstraint.constrained
      ? `Unconstrain ${axisConstraint.label} axes`
      : `Constrain ${axisConstraint.label} axes`}
    aria-label={axisConstraint.constrained
      ? `Unconstrain ${axisConstraint.label} axes`
      : `Constrain ${axisConstraint.label} axes`}
    aria-pressed={axisConstraint.constrained}
  >
    {#if axisConstraint.constrained}
      <Link2 class={MINI_ICON_CLASS} />
    {:else}
      <Unlink2 class={MINI_ICON_CLASS} />
    {/if}
  </Button>
{/if}
