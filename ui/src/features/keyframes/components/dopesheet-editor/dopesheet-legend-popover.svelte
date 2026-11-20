<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import HelpCircle from 'lucide-svelte/icons/help-circle'
  import LineChart from 'lucide-svelte/icons/line-chart'
  import Lock from 'lucide-svelte/icons/lock'
  import Timer from 'lucide-svelte/icons/timer'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

  interface DopesheetLegendPopoverProps {
    disabled?: boolean
  }

  let { disabled }: DopesheetLegendPopoverProps = $props()
  const triggerLabel = $derived(t('timeline.keyframeEditor.legend.trigger'))
</script>

<Popover>
  <PopoverTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="sm"
        class="h-6 w-6 p-0"
        {disabled}
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        <HelpCircle class="h-3 w-3" />
      </Button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="end" class="w-[260px] text-xs">
    <p class="mb-2 text-xs font-medium text-foreground">
      {t('timeline.keyframeEditor.legend.title')}
    </p>

    <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {t('timeline.keyframeEditor.legend.modesHeading')}
    </p>
    <ul class="mb-2 space-y-1 text-muted-foreground">
      <li>{t('timeline.keyframeEditor.legend.graphMode')}</li>
      <li>{t('timeline.keyframeEditor.legend.sheetMode')}</li>
    </ul>

    <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {t('timeline.keyframeEditor.legend.iconsHeading')}
    </p>
    <ul class="mb-2 space-y-1 text-muted-foreground">
      <li class="flex items-start gap-1.5">
        <LineChart class="mt-px h-3 w-3 flex-shrink-0 text-primary" />
        <span>{t('timeline.keyframeEditor.legend.iconCurve')}</span>
      </li>
      <li class="flex items-start gap-1.5">
        <Lock class="mt-px h-3 w-3 flex-shrink-0 text-red-400" />
        <span>{t('timeline.keyframeEditor.legend.iconLock')}</span>
      </li>
      <li class="flex items-start gap-1.5">
        <Timer class="mt-px h-3 w-3 flex-shrink-0" />
        <span>{t('timeline.keyframeEditor.legend.iconAutoKey')}</span>
      </li>
      <li class="flex items-start gap-1.5">
        <span class="mt-0.5 block h-2 w-2 flex-shrink-0 rotate-45 bg-neutral-200"></span>
        <span>{t('timeline.keyframeEditor.legend.iconDiamond')}</span>
      </li>
    </ul>

    <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {t('timeline.keyframeEditor.legend.colorsHeading')}
    </p>
    <ul class="space-y-1 text-muted-foreground">
      <li class="flex items-start gap-1.5">
        <span class="mt-0.5 block h-2 w-2 flex-shrink-0 rotate-45 bg-neutral-200"></span>
        <span>{t('timeline.keyframeEditor.legend.colorDefault')}</span>
      </li>
      <li class="flex items-start gap-1.5">
        <span
          class="mt-0.5 block h-2 w-2 flex-shrink-0 rotate-45 bg-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.45)]"
        ></span>
        <span>{t('timeline.keyframeEditor.legend.colorSelected')}</span>
      </li>
    </ul>
  </PopoverContent>
</Popover>
