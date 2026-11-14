<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** A stand-in for a preview component in preview-area tests: an empty element with test attributes. */
  let { testid, attrs = {} }: { testid: string; attrs?: Record<string, unknown> } = $props()
</script>

<div data-testid={testid} {...attrs}></div>
