<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Check from 'lucide-svelte/icons/check'
  import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

  /** A menu row that toggles a boolean preference without closing the menu. */
  interface MicToggleRowProps {
    label: string
    checked: boolean
    onToggle: (next: boolean) => void
  }

  let { label, checked, onToggle }: MicToggleRowProps = $props()
</script>

<DropdownMenuItem
  onSelect={(event) => {
    event.preventDefault()
    onToggle(!checked)
  }}
>
  <span class="flex-1">{label}</span>
  {#if checked}
    <Check class="h-3.5 w-3.5" />
  {/if}
</DropdownMenuItem>
