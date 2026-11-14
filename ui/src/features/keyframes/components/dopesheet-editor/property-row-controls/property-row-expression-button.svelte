<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Braces from 'lucide-svelte/icons/braces'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { PropertyRowExpressionButtonProps } from './types'

  let {
    linkableProperty,
    rowLabel,
    visible,
    canEdit,
    expressionError,
    disabled,
    rowLocked,
    propertyExpression,
    onOpenExpression,
  }: PropertyRowExpressionButtonProps = $props()

  const expressionEnabled = $derived(propertyExpression?.enabled ?? false)
</script>

{#if visible && linkableProperty && canEdit}
  <Button
    type="button"
    variant="ghost"
    size="sm"
    disabled={disabled || rowLocked}
    class={cn(
      MINI_ICON_BUTTON_CLASS,
      'self-center hover:bg-sky-500/10 hover:text-sky-300',
      expressionError
        ? 'text-red-400'
        : expressionEnabled
          ? 'text-sky-400'
          : 'text-muted-foreground opacity-30 hover:opacity-70',
    )}
    title={expressionError
      ? `${rowLabel} expression error: ${expressionError}`
      : propertyExpression
        ? `Edit ${rowLabel} expression (Advanced)`
        : `Add ${rowLabel} expression (Advanced)`}
    aria-label={expressionError
      ? `Edit ${rowLabel} expression: ${expressionError}`
      : propertyExpression
        ? `Edit ${rowLabel} expression`
        : `Add ${rowLabel} expression`}
    onclick={() => onOpenExpression(linkableProperty, propertyExpression)}
  >
    <Braces class={MINI_ICON_CLASS} />
  </Button>
{/if}
