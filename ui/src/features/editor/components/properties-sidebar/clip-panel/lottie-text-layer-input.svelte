<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Input } from '@/components/ui/input'
  import type { LottieTextLayer } from '@/infrastructure/lottie/lottie-text'

  interface TextLayerInputProps {
    layer: LottieTextLayer
    override: string | undefined
    /** Live preview on each keystroke (no undo entry). */
    onLive: (key: string, value: string) => void
    /** Final commit on blur/Enter. */
    onCommit: (key: string, value: string) => void
  }

  /**
   * A single template-text field. Keeps a local draft while editing and commits
   * on blur/Enter so we don't rebuild the Lottie renderer on every keystroke.
   */
  let { layer, override, onLive, onCommit }: TextLayerInputProps = $props()

  const committed = $derived(override ?? layer.text)
  // svelte-ignore state_referenced_locally
  let draft = $state(committed)

  // Resync when the committed value changes from outside (e.g. undo).
  $effect.pre(() => {
    draft = committed
  })

  const commit = () => {
    if (draft !== committed) onCommit(layer.key, draft)
  }
</script>

<Input
  value={draft}
  oninput={(e) => {
    const value = e.currentTarget.value
    draft = value
    onLive(layer.key, value)
  }}
  onblur={commit}
  onkeydown={(e) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }}
  class="h-7 text-xs"
  placeholder={layer.label}
  aria-label={layer.label}
/>
