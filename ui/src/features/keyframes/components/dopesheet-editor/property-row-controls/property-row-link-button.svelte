<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Unlink from '@lucide/svelte/icons/unlink'
  import { Button } from '@/components/ui/button'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import PickWhipIcon from '../pick-whip-icon.svelte'
  import type { PropertyLinkPointerEvent, PropertyRowLinkButtonProps } from './types'

  let {
    linkableProperty,
    rowLabel,
    visible,
    hasPropertyLink,
    sourceLabels,
    linkSource,
    onBeginLink,
    onRemoveLink,
    t,
  }: PropertyRowLinkButtonProps = $props()

  const linkSourceLabel = $derived(
    (linkableProperty ? sourceLabels?.[linkableProperty] : undefined) ??
      linkSource?.sourceProperty ??
      '',
  )

  const beginLink = (event: PropertyLinkPointerEvent) => {
    event.stopPropagation()
    if (linkableProperty) onBeginLink?.(event, linkableProperty)
  }
</script>

{#if visible && linkableProperty && onBeginLink}
  {#if !hasPropertyLink}
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class={cn(
        MINI_ICON_BUTTON_CLASS,
        'self-center touch-none text-muted-foreground opacity-30 hover:text-foreground hover:opacity-70',
      )}
      onpointerdown={beginLink}
      title={t('timeline.keyframeEditor.dragToLinkProperty', {
        property: rowLabel,
        defaultValue: `Drag to link ${rowLabel} to another property`,
      })}
      aria-label={t('timeline.keyframeEditor.dragToLinkProperty', {
        property: rowLabel,
        defaultValue: `Drag to link ${rowLabel} to another property`,
      })}
    >
      <PickWhipIcon class={MINI_ICON_CLASS} data-testid="pick-whip-icon" />
    </Button>
  {:else}
    <Popover>
      <PopoverTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            type="button"
            variant="ghost"
            size="sm"
            class={cn(
              MINI_ICON_BUTTON_CLASS,
              'self-center text-primary hover:bg-primary/10 hover:text-primary',
            )}
            onpointerdown={beginLink}
            title={t('timeline.keyframeEditor.linkedExpression', {
              source: linkSourceLabel,
              defaultValue: `Linked to ${linkSourceLabel}. Drag to re-link or click for options.`,
            })}
            aria-label={t('timeline.keyframeEditor.linkedExpression', {
              source: linkSourceLabel,
              defaultValue: `Linked to ${linkSourceLabel}`,
            })}
          >
            <PickWhipIcon class={MINI_ICON_CLASS} data-testid="pick-whip-icon" />
          </Button>
        {/snippet}
      </PopoverTrigger>
      <PopoverContent side="right" align="start" class="w-56 space-y-2 p-2">
        <div class="text-[10px] font-medium text-foreground">
          {t('timeline.keyframeEditor.propertyLink', {
            defaultValue: 'Property link',
          })}
        </div>
        <div class="truncate text-[10px] text-muted-foreground">{linkSourceLabel}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 w-full justify-start px-2 text-[10px] text-destructive hover:text-destructive"
          onclick={() => {
            if (linkableProperty) onRemoveLink?.(linkableProperty)
          }}
        >
          <Unlink class="mr-1.5 h-3 w-3" />
          {t('timeline.keyframeEditor.removePropertyLink', {
            defaultValue: 'Remove property link',
          })}
        </Button>
      </PopoverContent>
    </Popover>
  {/if}
{/if}
