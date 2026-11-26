<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import { Button } from '@/components/ui/button'
  import { Link } from '$lib/router'
  import { DOC_PAGES, type DocBlock, type DocPage, type DocSection } from '../docs-content'
  import Block from './block.svelte'
  import RelatedPages from './related-pages.svelte'

  let { page }: { page: DocPage } = $props()

  const index = $derived(DOC_PAGES.findIndex((candidate) => candidate.slug === page.slug))
  const previous = $derived(index > 0 ? DOC_PAGES[index - 1] : undefined)
  const next = $derived(
    index >= 0 && index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : undefined,
  )

  function sectionBlocks(section: DocSection): DocBlock[] {
    return section.blocks ?? (section.items ? [{ kind: 'list', items: section.items }] : [])
  }
</script>

<article class="rounded-lg border border-border bg-card">
  <div class="border-b border-border p-6 sm:p-8">
    <Link
      to="/docs"
      class="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Docs
    </Link>
    <p class="text-sm font-medium text-primary">{page.category}</p>
    <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{page.title}</h1>
    <p class="mt-3 max-w-3xl text-muted-foreground">{page.description}</p>
  </div>

  <div class="space-y-8 p-6 sm:p-8">
    {#each page.sections as section, sectionIndex (sectionIndex)}
      <section>
        <h2 class="text-xl font-semibold">{section.title}</h2>
        <div class="mt-3 space-y-4 text-sm leading-6 text-muted-foreground">
          {#each sectionBlocks(section) as block, blockIndex (blockIndex)}
            <Block {block} />
          {/each}
        </div>
      </section>
    {/each}

    <RelatedPages slugs={page.related} />
  </div>

  <footer class="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
    {#if previous}
      <Button variant="outline" class="justify-start">
        {#snippet child({ props })}
          <Link {...props} to="/docs/$slug" params={{ slug: previous.slug }}>
            <ArrowLeft class="h-4 w-4" />
            {previous.title}
          </Link>
        {/snippet}
      </Button>
    {:else}
      <div></div>
    {/if}
    {#if next}
      <Button variant="outline" class="justify-end">
        {#snippet child({ props })}
          <Link {...props} to="/docs/$slug" params={{ slug: next.slug }}>
            {next.title}
            <ArrowRight class="h-4 w-4" />
          </Link>
        {/snippet}
      </Button>
    {/if}
  </footer>
</article>
