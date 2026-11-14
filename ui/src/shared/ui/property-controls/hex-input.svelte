<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const NON_HEX_CHARS = /[^0-9a-fA-F]/g

  /** Strip the leading `#` and any non-hex chars, capped at `maxDigits`. */
  export function normalizeHexDraft(color: string, maxDigits: number): string {
    return color.startsWith('#')
      ? color.slice(1).replace(NON_HEX_CHARS, '').slice(0, maxDigits)
      : ''
  }

  /**
   * react-colorful accepts 3- or 6-digit hex, plus 4- or 8-digit when alpha is on.
   */
  function isCompleteHex(draft: string, allowAlpha: boolean): boolean {
    if (draft.length === 3 || draft.length === 6) return true
    return allowAlpha && (draft.length === 4 || draft.length === 8)
  }

  interface HexInputProps {
    /** Current color (live), used to seed/sync the draft when not focused */
    color: string
    /** Fires on every complete-hex keystroke for live preview */
    onLiveChange: (color: string) => void
    /** Fires on blur / Enter to commit */
    onCommit: (color: string) => void
    /** Accept 4-/8-digit hex (alpha channel) in addition to 3-/6-digit */
    allowAlpha?: boolean
    disabled?: boolean
    class?: string
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'

  /**
   * Editable hex field backed by its own local draft state. Decoupling the draft
   * from the live `color` prop lets the value update the color live (per keystroke)
   * without the parent's live updates resetting what the user is typing.
   */
  let {
    color,
    onLiveChange,
    onCommit,
    allowAlpha,
    disabled,
    class: className,
  }: HexInputProps = $props()

  const maxDigits = $derived(allowAlpha ? 8 : 6)
  let draft = $state(untrack(() => normalizeHexDraft(color, maxDigits)))
  let isFocused = false
  // Set when Enter/Escape blurs the input itself, so the resulting onBlur skips
  // its commit: Enter already committed (avoid a duplicate onChange) and Escape
  // reset the draft (committing would persist the stale typed value).
  let skipBlurCommit = false

  // Sync the draft to external color changes only while the user isn't typing.
  $effect(() => {
    const next = normalizeHexDraft(color, maxDigits)
    if (!isFocused) draft = next
  })

  const handleInput = (e: Event & { currentTarget: HTMLInputElement }) => {
    const next = e.currentTarget.value.replace(NON_HEX_CHARS, '').slice(0, maxDigits)
    draft = next
    // A controlled React input re-renders the stripped value; do it by hand.
    if (e.currentTarget.value !== next) e.currentTarget.value = next
    if (isCompleteHex(next, !!allowAlpha)) onLiveChange(`#${next}`)
  }

  const commit = () => {
    if (isCompleteHex(draft, !!allowAlpha)) onCommit(`#${draft}`)
    else draft = normalizeHexDraft(color, maxDigits) // revert incomplete input
  }

  const handleKeyDown = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      skipBlurCommit = true
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      draft = normalizeHexDraft(color, maxDigits)
      skipBlurCommit = true
      e.currentTarget.blur()
    }
  }
</script>

<input
  type="text"
  value={draft}
  oninput={handleInput}
  onfocus={() => {
    isFocused = true
  }}
  onblur={() => {
    isFocused = false
    if (skipBlurCommit) {
      skipBlurCommit = false
      return
    }
    commit()
  }}
  onkeydown={handleKeyDown}
  {disabled}
  spellcheck={false}
  autocapitalize="characters"
  autocomplete="off"
  class={className}
/>
