<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Link, type RouteComponentProps } from '$lib/router'
  import { DocsArticle, DocsShell } from '@/features/docs/docs-shell'
  import { getDocPage } from '@/features/docs/docs-content'
  import { Button } from '@/components/ui/button'

  let { params }: RouteComponentProps = $props()

  const page = $derived(getDocPage(params.slug!))
</script>

{#if !page}
  <DocsShell>
    <div class="rounded-lg border border-border bg-card p-8">
      <h1 class="text-2xl font-semibold">Docs page not found</h1>
      <p class="mt-3 text-muted-foreground">
        This docs URL does not match a published guide.
      </p>
      <Button class="mt-6">
        {#snippet child({ props })}<Link {...props} to="/docs">Back to docs</Link>{/snippet}
      </Button>
    </div>
  </DocsShell>
{:else}
  <DocsShell currentSlug={page.slug}>
    <DocsArticle {page} />
  </DocsShell>
{/if}
