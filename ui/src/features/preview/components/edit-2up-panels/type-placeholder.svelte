<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">


  const TYPE_PLACEHOLDER_COLORS: Record<string, string> = {
    image: '#22c55e',
    text: '#f59e0b',
    shape: '#8b5cf6',
    adjustment: '#6b7280',
    composition: '#3b82f6',
    audio: '#ec4899',
    gap: '#111827',
  }
</script>

<script lang="ts">
  let { type, text }: { type: string; text: string } = $props()
  const color = $derived(TYPE_PLACEHOLDER_COLORS[type] ?? '#6b7280')
</script>

<div
  class="w-full h-full flex items-center justify-center"
  style:background-color={color}
>
  <span class="text-sm font-medium text-white/90 uppercase tracking-wide">
    {text}
  </span>
</div>
