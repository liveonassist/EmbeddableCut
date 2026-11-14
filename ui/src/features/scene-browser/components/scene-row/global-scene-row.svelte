<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import SceneRowBase from './scene-row-base.svelte'
  import type { SceneRowVariantProps } from './types'

  let { scene, match }: SceneRowVariantProps = $props()
</script>

<SceneRowBase {scene} mediaName="source" {match} />
