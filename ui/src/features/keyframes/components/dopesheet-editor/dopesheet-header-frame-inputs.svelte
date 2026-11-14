<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Input } from '@/components/ui/input'
  import type { Ref } from '../ref-state.svelte'

  interface DopesheetHeaderFrameInputsProps {
    disabled: boolean
    inputsEnabled: boolean
    totalFrames: number
    globalFrame: number | null
    localFrameInputValue: string
    globalFrameInputValue: string
    setLocalFrameInputValue: (value: string) => void
    setGlobalFrameInputValue: (value: string) => void
    skipNextHeaderFrameBlurRef: Ref<'local' | 'global' | null>
    commitLocalFrameInput: () => void
    commitGlobalFrameInput: () => void
    handleHeaderFrameInputKeyDown: (
      event: KeyboardEvent & { currentTarget: HTMLInputElement },
      input: 'local' | 'global',
      commit: () => void,
    ) => void
  }

  let {
    disabled,
    inputsEnabled,
    totalFrames,
    globalFrame,
    localFrameInputValue,
    globalFrameInputValue,
    setLocalFrameInputValue,
    setGlobalFrameInputValue,
    skipNextHeaderFrameBlurRef,
    commitLocalFrameInput,
    commitGlobalFrameInput,
    handleHeaderFrameInputKeyDown,
  }: DopesheetHeaderFrameInputsProps = $props()

  const inputDisabled = $derived(disabled || !inputsEnabled)
  const inputClass =
    'h-5 px-1 text-center text-[10px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
</script>

<div class="flex items-center gap-1">
  <div class="flex items-center gap-0.5">
    <span class="text-[10px] text-muted-foreground">
      {t('timeline.keyframeEditor.local')}
    </span>
    <Input
      type="number"
      autocomplete="off"
      data-bwignore="true"
      value={localFrameInputValue}
      oninput={(event) => setLocalFrameInputValue(event.currentTarget.value)}
      placeholder="-"
      onblur={() => {
        if (skipNextHeaderFrameBlurRef.current === 'local') {
          skipNextHeaderFrameBlurRef.current = null
          return
        }
        commitLocalFrameInput()
      }}
      onkeydown={(event) => handleHeaderFrameInputKeyDown(event, 'local', commitLocalFrameInput)}
      aria-label={t('timeline.keyframeEditor.localFrame')}
      class="{inputClass} w-12"
      min={0}
      max={Math.max(totalFrames - 1, 0)}
      disabled={inputDisabled}
    />
  </div>
  {#if globalFrame !== null}
    <div class="flex items-center gap-0.5">
      <span class="text-[10px] text-muted-foreground">
        {t('timeline.keyframeEditor.global')}
      </span>
      <Input
        type="number"
        autocomplete="off"
        data-bwignore="true"
        value={globalFrameInputValue}
        oninput={(event) => setGlobalFrameInputValue(event.currentTarget.value)}
        placeholder="-"
        onblur={() => {
          if (skipNextHeaderFrameBlurRef.current === 'global') {
            skipNextHeaderFrameBlurRef.current = null
            return
          }
          commitGlobalFrameInput()
        }}
        onkeydown={(event) => handleHeaderFrameInputKeyDown(event, 'global', commitGlobalFrameInput)}
        aria-label={t('timeline.keyframeEditor.globalFrame')}
        class="{inputClass} w-14"
        disabled={inputDisabled}
      />
    </div>
  {/if}
</div>
