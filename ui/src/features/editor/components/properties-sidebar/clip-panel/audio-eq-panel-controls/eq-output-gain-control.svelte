<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { AUDIO_EQ_GAIN_DB_MAX, AUDIO_EQ_GAIN_DB_MIN } from '@/shared/utils/audio-eq'
  import { demixValue } from '../../utils/mixed-value'
  import { formatOutputGainDb, roundOutputGainDb } from '../audio-eq-panel-values'

  interface EqOutputGainControlProps {
    value: number | 'mixed'
    onChange: (value: number) => void
    onLiveChange: (value: number) => void
    disabled?: boolean
    compact?: boolean
  }

  let {
    value,
    onChange,
    onLiveChange,
    disabled = false,
    compact = false,
  }: EqOutputGainControlProps = $props()

  let draftValue = $state<number | null>(null)
  const resolvedValue = $derived(demixValue(value, 0))
  const displayValue = $derived(draftValue ?? resolvedValue)
  const range = AUDIO_EQ_GAIN_DB_MAX - AUDIO_EQ_GAIN_DB_MIN
  const thumbPercent = $derived(
    (1 - (displayValue - AUDIO_EQ_GAIN_DB_MIN) / Math.max(range, 1)) * 100,
  )

  const valueFromClientY = (clientY: number, rect: DOMRect) => {
    const normalized = 1 - (clientY - rect.top) / Math.max(rect.height, 1)
    return roundOutputGainDb(AUDIO_EQ_GAIN_DB_MIN + Math.max(0, Math.min(1, normalized)) * range)
  }

  const commitValue = (nextValue: number) => {
    draftValue = null
    onChange(roundOutputGainDb(nextValue))
  }

  const handlePointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (disabled) return
    event.preventDefault()
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const startValue = valueFromClientY(event.clientY, rect)
    target.setPointerCapture?.(event.pointerId)
    draftValue = startValue
    onLiveChange(startValue)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextValue = valueFromClientY(moveEvent.clientY, rect)
      draftValue = nextValue
      onLiveChange(nextValue)
    }

    const handlePointerEnd = (endEvent: PointerEvent) => {
      target.releasePointerCapture?.(event.pointerId)
      const nextValue = valueFromClientY(endEvent.clientY, rect)
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', handlePointerEnd)
      target.removeEventListener('pointercancel', handlePointerEnd)
      commitValue(nextValue)
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', handlePointerEnd)
    target.addEventListener('pointercancel', handlePointerEnd)
  }

  const ticks = [20, 10, 0, -10, -20]
</script>

<div
  class={cn(
    'flex shrink-0 flex-col px-1 pb-1 pt-1',
    compact ? 'w-[68px] h-[220px]' : 'w-[76px] h-[clamp(288px,33vh,344px)]',
    disabled && 'opacity-50',
  )}
>
  <div class="text-[10px] uppercase tracking-[0.16em] text-zinc-500 text-center">Gain</div>
  <div
    role="presentation"
    class={cn(
      'relative mt-1 min-h-0 flex-1 w-full touch-none select-none',
      disabled ? 'pointer-events-none' : 'cursor-ns-resize',
    )}
    ondblclick={() => {
      if (disabled) return
      draftValue = null
      onLiveChange(0)
      onChange(0)
    }}
    onpointerdown={handlePointerDown}
  >
    <div class="absolute inset-x-0 top-0 bottom-7">
      {#each ticks as tick (tick)}
        {@const tickPercent = (1 - (tick - AUDIO_EQ_GAIN_DB_MIN) / Math.max(range, 1)) * 100}
        <div class="pointer-events-none absolute inset-x-0" style:top="{tickPercent}%">
          <div class="absolute left-2 right-7 h-px -translate-y-1/2 bg-[#34363d]"></div>
          <span
            class="absolute right-1 -translate-y-1/2 text-[9px] font-mono text-zinc-500 text-right"
          >
            {tick > 0 ? `+${tick}` : tick}
          </span>
        </div>
      {/each}
      <div class="absolute bottom-0 left-[16px] top-0 w-px bg-[#2f3138]"></div>
      <div
        class="absolute left-[7px] h-7 w-[18px] -translate-y-1/2 rounded-[2px] border border-[#666a73] bg-[#b9bbc2] shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
        style:top="{thumbPercent}%"
      ></div>
    </div>
  </div>
  <div
    class="mt-0.5 min-h-[18px] w-full text-center text-sm font-medium tabular-nums text-[#16d9ff]"
  >
    {formatOutputGainDb(displayValue)}
  </div>
</div>
