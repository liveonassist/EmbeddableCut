<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import Mic from 'lucide-svelte/icons/mic'
  import Square from 'lucide-svelte/icons/square'
  import Pause from 'lucide-svelte/icons/pause'
  import Play from 'lucide-svelte/icons/play'
  import X from 'lucide-svelte/icons/x'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { useMicRecordingStore, isMicRecordingActive } from '@/shared/state/mic-recording-store'
  import {
    startMicRecording,
    stopMicRecording,
    pauseMicRecording,
    resumeMicRecording,
    cancelMicRecording,
    refreshMicDevices,
    stopMicMonitor,
    cancelPendingMicRecording,
    isMicRecordingSupported,
  } from '@/features/timeline/services/mic-recording-controller'
  import MicDevicePicker from './mic-device-picker.svelte'
  import MicElapsed from './mic-elapsed.svelte'
  import MicLevelMeter from './mic-level-meter.svelte'

  /**
   * Timeline-toolbar microphone control. Records a live voiceover synced to the
   * playhead: pressing record starts playback and lays the finished take onto a
   * new audio track. See `mic-recording-controller.ts`.
   */
  const status = select(useMicRecordingStore, (s) => s.status)
  const error = select(useMicRecordingStore, (s) => s.error)
  const setError = select(useMicRecordingStore, (s) => s.setError)

  // Populate device labels once on mount (real names appear after first grant).
  // On unmount (e.g. leaving the editor / switching projects) tear down any live
  // take or monitor so the mic stream never stays hot in the background.
  $effect(() => {
    void refreshMicDevices()
    return () => {
      const status = useMicRecordingStore.getState().status
      if (isMicRecordingActive(status)) {
        cancelMicRecording()
      } else if (status === 'requesting') {
        // A permission prompt / getUserMedia is still pending — cancel it so the
        // mic doesn't go live and start the transport after we've unmounted.
        cancelPendingMicRecording()
      } else {
        stopMicMonitor()
      }
    }
  })

  // Surface controller errors as a toast, then clear so they don't re-fire.
  $effect(() => {
    const message = error.current
    const clearError = setError.current
    if (!message) return
    untrack(() => {
      toast.error(message)
      clearError(null)
    })
  })

  const buttonSize = EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize
  const btnSize = `width: ${buttonSize}; height: ${buttonSize}`

  const active = $derived(isMicRecordingActive(status.current))
  const isRecording = $derived(status.current === 'recording')
  const isPaused = $derived(status.current === 'paused')
  const isFinalizing = $derived(status.current === 'finalizing')
  const isRequesting = $derived(status.current === 'requesting')
</script>

{#if isMicRecordingSupported()}
  {#if !active && !isFinalizing}
    <!-- Idle: record button + device picker. -->
    <div class="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        style={btnSize}
        disabled={isRequesting}
        onclick={() => void startMicRecording()}
        aria-label={t('recording.record')}
        data-tooltip={t('recording.recordTooltip')}
      >
        {#if isRequesting}
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
        {:else}
          <Mic class="h-3.5 w-3.5" style="color: var(--color-destructive)" />
        {/if}
      </Button>
      <MicDevicePicker disabled={isRequesting} />
    </div>
  {:else}
    <div class="flex items-center gap-1.5 rounded-md bg-destructive/10 px-1.5 py-0.5">
      <span
        class="h-2 w-2 shrink-0 rounded-full {isRecording ? 'animate-pulse' : ''}"
        style:background-color="var(--color-destructive)"
        aria-hidden="true"
      ></span>
      <MicElapsed />

      {#if isFinalizing}
        <span class="flex items-center gap-1 px-1 text-xs text-muted-foreground">
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
          {t('recording.saving')}
        </span>
      {:else}
        <div class="w-10">
          <MicLevelMeter />
        </div>
        <Button
          variant="ghost"
          size="icon"
          style={btnSize}
          onclick={() => (isPaused ? resumeMicRecording() : pauseMicRecording())}
          aria-label={isPaused ? t('recording.resume') : t('recording.pause')}
          data-tooltip={isPaused ? t('recording.resume') : t('recording.pause')}
        >
          {#if isPaused}
            <Play class="h-3.5 w-3.5" />
          {:else}
            <Pause class="h-3.5 w-3.5" />
          {/if}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          style={btnSize}
          onclick={() => void stopMicRecording()}
          aria-label={t('recording.stop')}
          data-tooltip={t('recording.stopTooltip')}
        >
          <Square class="h-3.5 w-3.5" style="color: var(--color-destructive)" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          style={btnSize}
          onclick={cancelMicRecording}
          aria-label={t('recording.cancel')}
          data-tooltip={t('recording.cancelTooltip')}
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      {/if}
    </div>
  {/if}
{/if}
