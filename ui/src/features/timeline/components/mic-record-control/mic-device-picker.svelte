<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Check from 'lucide-svelte/icons/check'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import Headphones from 'lucide-svelte/icons/headphones'
  import Minus from 'lucide-svelte/icons/minus'
  import Plus from 'lucide-svelte/icons/plus'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { useMicRecordingStore } from '@/shared/state/mic-recording-store'
  import {
    refreshMicDevices,
    startMicMonitor,
    stopMicMonitor,
  } from '@/features/timeline/services/mic-recording-controller'
  import MicLevelMeter from './mic-level-meter.svelte'
  import MicToggleRow from './mic-toggle-row.svelte'

  let { disabled }: { disabled?: boolean } = $props()

  const devices = select(useMicRecordingStore, (s) => s.devices)
  const selectedDeviceId = select(useMicRecordingStore, (s) => s.selectedDeviceId)
  const setSelectedDeviceId = select(useMicRecordingStore, (s) => s.setSelectedDeviceId)
  const noiseSuppression = select(useMicRecordingStore, (s) => s.noiseSuppression)
  const autoGainControl = select(useMicRecordingStore, (s) => s.autoGainControl)
  const muteWhileRecording = select(useMicRecordingStore, (s) => s.muteWhileRecording)
  const syncOffsetMs = select(useMicRecordingStore, (s) => s.syncOffsetMs)
  const setNoiseSuppression = select(useMicRecordingStore, (s) => s.setNoiseSuppression)
  const setAutoGainControl = select(useMicRecordingStore, (s) => s.setAutoGainControl)
  const setMuteWhileRecording = select(useMicRecordingStore, (s) => s.setMuteWhileRecording)
  const setSyncOffsetMs = select(useMicRecordingStore, (s) => s.setSyncOffsetMs)

  // Re-opening the picker re-reads the (possibly changed) device selection, so
  // restart the monitor when a toggle that affects the stream changes.
  const handleDeviceChange = (deviceId: string | null) => {
    setSelectedDeviceId.current(deviceId)
    stopMicMonitor()
    void startMicMonitor()
  }
</script>

<DropdownMenu
  onOpenChange={(open) => {
    if (open) {
      void refreshMicDevices()
      void startMicMonitor()
    } else {
      stopMicMonitor()
    }
  }}
>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon"
        style="width: 20px; height: {EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}"
        {disabled}
        aria-label={t('recording.chooseDevice')}
        data-tooltip={t('recording.chooseDevice')}
      >
        <ChevronDown class="h-3 w-3 opacity-70" />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" class="min-w-64">
    <DropdownMenuLabel>{t('recording.microphone')}</DropdownMenuLabel>
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault()
        handleDeviceChange(null)
      }}
    >
      <span class="flex-1">{t('recording.systemDefault')}</span>
      {#if selectedDeviceId.current === null}
        <Check class="h-3.5 w-3.5" />
      {/if}
    </DropdownMenuItem>
    {#each devices.current as device (device.deviceId)}
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault()
          handleDeviceChange(device.deviceId)
        }}
      >
        <span class="flex-1 truncate">{device.label}</span>
        {#if selectedDeviceId.current === device.deviceId}
          <Check class="h-3.5 w-3.5" />
        {/if}
      </DropdownMenuItem>
    {/each}

    <div class="px-2 py-1.5">
      <MicLevelMeter />
    </div>

    <DropdownMenuSeparator />
    <DropdownMenuLabel>{t('recording.settings')}</DropdownMenuLabel>
    <MicToggleRow
      label={t('recording.noiseSuppression')}
      checked={noiseSuppression.current}
      onToggle={setNoiseSuppression.current}
    />
    <MicToggleRow
      label={t('recording.autoGain')}
      checked={autoGainControl.current}
      onToggle={setAutoGainControl.current}
    />
    <MicToggleRow
      label={t('recording.muteWhileRecording')}
      checked={muteWhileRecording.current}
      onToggle={setMuteWhileRecording.current}
    />

    <div class="flex items-center justify-between px-2 py-1.5 text-sm">
      <span>{t('recording.syncOffset')}</span>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          onclick={() => setSyncOffsetMs.current(syncOffsetMs.current - 10)}
          aria-label={t('recording.syncOffsetEarlier')}
        >
          <Minus class="h-3 w-3" />
        </Button>
        <span class="min-w-[3.5rem] text-center font-mono text-xs tabular-nums"
          >{syncOffsetMs.current > 0 ? `+${syncOffsetMs.current}` : syncOffsetMs.current} ms</span
        >
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          onclick={() => setSyncOffsetMs.current(syncOffsetMs.current + 10)}
          aria-label={t('recording.syncOffsetLater')}
        >
          <Plus class="h-3 w-3" />
        </Button>
      </div>
    </div>

    <div class="flex items-start gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
      <Headphones class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{t('recording.headphonesHint')}</span>
    </div>
  </DropdownMenuContent>
</DropdownMenu>
