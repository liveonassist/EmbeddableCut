<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { THUMB_WHEEL_CLASS } from './gpu-wheels-panel-shared'

  interface DockThumbWheelProps {
    ariaLabel: string
    name: string
    value: number
    min?: number
    max?: number
    step?: number
    disabled: boolean
    onLive: (value: string) => void
    onCommit: (value: string) => void
  }

  /**
   * `DockThumbWheel` from gpu-wheels-panel.tsx. Range slider that previews live
   * while dragging and commits once on release: the input event fires for range
   * inputs on every move, so committing there would push a timeline mutation
   * (and undo entry) per dragged pixel — local drag state keeps the thumb
   * responsive without re-rendering the panel.
   */
  let { ariaLabel, name, value, min, max, step, disabled, onLive, onCommit }: DockThumbWheelProps =
    $props()

  let dragValue = $state<string | null>(null)

  const commit = (raw: string) => {
    dragValue = null
    onCommit(raw)
  }
</script>

<input
  aria-label={ariaLabel}
  type="range"
  {name}
  value={dragValue ?? value}
  {min}
  {max}
  {step}
  {disabled}
  oninput={(event) => {
    const raw = event.currentTarget.value
    dragValue = raw
    onLive(raw)
  }}
  onpointerup={(event) => commit(event.currentTarget.value)}
  onpointercancel={(event) => commit(event.currentTarget.value)}
  onkeydown={(event) => event.stopPropagation()}
  onkeyup={(event) => {
    if (dragValue !== null) commit(event.currentTarget.value)
  }}
  onblur={(event) => {
    if (dragValue !== null) commit(event.currentTarget.value)
  }}
  class={THUMB_WHEEL_CLASS}
/>
