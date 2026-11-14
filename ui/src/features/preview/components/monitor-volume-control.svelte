<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import Volume1 from 'lucide-svelte/icons/volume-1'
  import Volume2 from 'lucide-svelte/icons/volume-2'
  import VolumeX from 'lucide-svelte/icons/volume-x'
  import { Button } from '@/components/ui/button'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import { Slider } from '@/components/ui/slider'
  import { usePlaybackStore } from '@/shared/state/playback'

  interface MonitorVolumeControlProps {
    /** Style forwarded to the trigger button so it matches sibling controls. */
    buttonStyle?: string
  }

  let { buttonStyle }: MonitorVolumeControlProps = $props()

  const volume = select(usePlaybackStore, (s) => s.volume)
  const muted = select(usePlaybackStore, (s) => s.muted)
  const setVolume = usePlaybackStore.getState().setVolume
  const toggleMute = usePlaybackStore.getState().toggleMute

  const Icon = $derived.by(() => {
    if (muted.current || volume.current <= 0) return VolumeX
    if (volume.current < 0.5) return Volume1
    return Volume2
  })

  const percent = $derived(Math.round(volume.current * 100))
</script>

<Popover>
  <PopoverTrigger>
    {#snippet child({ props })}
      <Button {...props}
        variant="ghost"
        size="icon"
        class="flex-shrink-0"
        style={buttonStyle}
        data-tooltip={muted.current ? t('preview.monitor.muted') : t('preview.monitor.percent', { percent })}
        aria-label={t('preview.monitor.volume')}
      >
        <Icon class="w-3.5 h-3.5" />
      </Button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent
    class="w-56 p-3 space-y-3"
    align="center"
    side="top"
    sideOffset={6}
  >
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium">
        {t('preview.monitor.title')}
      </span>
      <span class="text-[10px] text-muted-foreground uppercase tracking-wider">
        {t('preview.monitor.thisDeviceOnly')}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7 shrink-0"
        onclick={toggleMute}
        aria-label={muted.current ? t('preview.monitor.unmute') : t('preview.monitor.mute')}
      >
        {#if muted.current}
          <VolumeX class="w-3.5 h-3.5" />
        {:else}
          <Volume2 class="w-3.5 h-3.5" />
        {/if}
      </Button>
      <Slider
        value={[muted.current ? 0 : volume.current]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={([v]: number[]) => {
          if (v === undefined) return
          if (muted.current && v > 0) toggleMute()
          setVolume(v)
        }}
        class="flex-1"
       />
      <span class="text-xs text-muted-foreground tabular-nums w-9 text-right">
        {#if muted.current}
          {t('preview.monitor.muteShort')}
        {:else}
          {`${percent}%`}
        {/if}
      </span>
    </div>
    <p class="text-[10px] text-muted-foreground leading-snug">
      {t('preview.monitor.previewOnlyNote')}
    </p>
  </PopoverContent>
</Popover>
