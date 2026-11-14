<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ArrowRight from 'lucide-svelte/icons/arrow-right'
  import { Link } from '@/app/router'
  import { getDocPage, type DocPage } from '../docs-content'

  let { slugs }: { slugs?: string[] } = $props()

  const related = $derived(
    (slugs ?? []).map(getDocPage).filter((page): page is DocPage => Boolean(page)),
  )
</script>

{#if related.length > 0}
  <section class="border-t border-border pt-6">
    <h2 class="text-xl font-semibold">Related</h2>
    <div class="mt-3 flex flex-wrap gap-2">
      {#each related as page (page.slug)}
        <Link
          to="/docs/$slug"
          params={{ slug: page.slug }}
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-primary/60"
        >
          {page.title}
          <ArrowRight class="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
      {/each}
    </div>
  </section>
{/if}
