<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import MoreHorizontal from 'lucide-svelte/icons/more-horizontal'
  import { Button } from '@/components/ui/button'
  import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import type { AnimatableProperty } from '@/types/keyframe'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from './dopesheet-constants'
  import type { DopesheetDimensionSeparationEntry } from './dopesheet-group-options-menu'

  interface DopesheetGroupOptionsMenuProps {
    groupLabel: string
    dimensionSeparation: DopesheetDimensionSeparationEntry | null
    disabled: boolean
    isPropertyLocked: (property: AnimatableProperty) => boolean
  }

  let { groupLabel, dimensionSeparation, disabled, isPropertyLocked }: DopesheetGroupOptionsMenuProps =
    $props()

  const menuLabel = $derived(`${groupLabel} options`)
</script>

{#if dimensionSeparation}
  {@const { property, control } = dimensionSeparation}
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          type="button"
          variant="ghost"
          size="sm"
          class="{MINI_ICON_BUTTON_CLASS} text-muted-foreground hover:text-foreground"
          disabled={disabled || isPropertyLocked(property) || control.disabled}
          title={menuLabel}
          aria-label={menuLabel}
        >
          <MoreHorizontal class={MINI_ICON_CLASS} />
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-[220px]">
      <DropdownMenuCheckboxItem
        checked={control.separated}
        onCheckedChange={(checked) => control.onChange(checked === true)}
      >
        Separate {control.label} dimensions
      </DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  </DropdownMenu>
{/if}
