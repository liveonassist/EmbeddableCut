<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Input } from '@/components/ui/input'
  import { PropertyRow } from '@/shared/ui/property-controls'
  import ParamResetButton from './param-reset-button.svelte'
  import type { GpuParamValue } from './panel-props'

  interface TextParamRowProps {
    effectId: string
    paramKey: string
    label: string
    value: string
    disabled: boolean
    class?: string
    onParamChange: (effectId: string, paramKey: string, value: GpuParamValue) => void
    onParamLiveChange: (effectId: string, paramKey: string, value: GpuParamValue) => void
    defaultValue: string
  }

  /**
   * Text param row (`TextParamRow` in gpu-effect-panel.tsx). Mirrors the
   * number/color rows' live-then-commit pattern: the input drives a local draft +
   * live preview on each keystroke and only commits to history on blur, instead
   * of committing on every keystroke.
   */
  let {
    effectId,
    paramKey,
    label,
    value,
    disabled,
    class: className,
    onParamChange,
    onParamLiveChange,
    defaultValue,
  }: TextParamRowProps = $props()

  // svelte-ignore state_referenced_locally
  let draft = $state(value)
  let isEditing = false

  // Keep the draft in sync with external updates (undo/redo, keyframes, reset)
  // while the field isn't being actively edited.
  $effect(() => {
    const next = value
    if (!isEditing) draft = next
  })
</script>

<PropertyRow {label} class={className}>
  <Input
    value={draft}
    onfocus={() => {
      isEditing = true
    }}
    oninput={(e) => {
      draft = e.currentTarget.value
      onParamLiveChange(effectId, paramKey, e.currentTarget.value)
    }}
    onblur={() => {
      isEditing = false
      if (draft !== value) onParamChange(effectId, paramKey, draft)
    }}
    {disabled}
    class="h-6 text-xs flex-1 min-w-0"
    spellcheck={false}
  />
  <ParamResetButton {effectId} {paramKey} {label} {value} {defaultValue} {onParamChange} />
</PropertyRow>
