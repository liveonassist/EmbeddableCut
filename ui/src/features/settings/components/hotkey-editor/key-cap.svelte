<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Keyboard key cap — renders a single physical key or invisible gap spacer. */
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
  import { formatHotkeyBinding } from '@/config/hotkeys'
  import { cn } from '@/shared/ui/cn'
  import {
    KEY_ACTIVE_CLASSES,
    KEY_BASE_CLASSES,
    KEY_IDLE_CLASSES,
    type KeyboardKeySpec,
  } from './model'

  let {
    keySpec,
    isActive,
    isLayerKey = false,
    displayLabel,
    ariaLabel,
    tooltip,
    onClick,
    onMouseEnter,
    onMouseLeave,
  }: {
    keySpec: KeyboardKeySpec
    isActive: boolean
    isLayerKey?: boolean
    displayLabel?: string
    ariaLabel?: string
    tooltip?: string
    onClick?: () => void
    onMouseEnter?: () => void
    onMouseLeave?: () => void
  } = $props()

  const label = $derived(
    displayLabel ?? keySpec.label ?? (keySpec.token ? formatHotkeyBinding(keySpec.token) : ''),
  )

  const capClass = $derived(
    cn(
      KEY_BASE_CLASSES,
      isActive
        ? KEY_ACTIVE_CLASSES
        : isLayerKey
          ? 'border-primary/25 bg-primary/8 text-foreground/85'
          : KEY_IDLE_CLASSES,
    ),
  )
</script>

<!--
  Interactive caps (an actionable command token) are real buttons so the whole
  on-screen keyboard is reachable and operable via Tab/Enter. Modifier caps
  (mod/alt/shift) aren't actionable — they render as static, non-focusable caps.
-->
{#snippet keyCap(props: Record<string, unknown>)}
  {#if keySpec.token && onClick}
    <button
      {...props}
      type="button"
      aria-label={ariaLabel}
      aria-pressed={isActive}
      class={cn(
        capClass,
        'cursor-pointer hover:border-white/12 hover:text-foreground/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
      )}
      style:flex={keySpec.width ?? 1}
      onclick={(event) => {
        ;(props.onclick as ((event: MouseEvent) => void) | undefined)?.(event)
        onClick()
      }}
      onmouseenter={(event) => {
        ;(props.onmouseenter as ((event: MouseEvent) => void) | undefined)?.(event)
        onMouseEnter?.()
      }}
      onmouseleave={(event) => {
        ;(props.onmouseleave as ((event: MouseEvent) => void) | undefined)?.(event)
        onMouseLeave?.()
      }}
    >
      {label}
    </button>
  {:else}
    <div {...props} class={capClass} style:flex={keySpec.width ?? 1} aria-hidden="true">
      {label}
    </div>
  {/if}
{/snippet}

{#if keySpec.isGap}
  <div style:flex={keySpec.width ?? 1}></div>
{:else if !tooltip}
  {@render keyCap({})}
{:else}
  <Tooltip>
    <TooltipTrigger>
      {#snippet child({ props })}
        {@render keyCap(props)}
      {/snippet}
    </TooltipTrigger>
    <TooltipContent side="top">{tooltip}</TooltipContent>
  </Tooltip>
{/if}
