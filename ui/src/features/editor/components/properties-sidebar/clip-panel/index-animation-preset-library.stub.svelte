<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `AnimationPresetLibrary` in tests: exposes how it was embedded. */
  let { embedded, variant }: { embedded?: boolean; variant?: 'full' | 'edit' } = $props()
</script>

<div
  data-testid="motion-library-mock"
  data-embedded={String(embedded)}
  data-variant={variant ?? 'full'}
></div>
