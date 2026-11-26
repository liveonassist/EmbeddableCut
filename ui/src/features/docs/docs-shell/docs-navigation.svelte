<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open'
  import Search from '@lucide/svelte/icons/search'
  import { Link } from '$lib/router'
  import { cn } from '@/shared/ui/cn'
  import { DOC_GROUPS, DOC_PAGES } from '../docs-content'
  import { pageSearchText } from './search'

  let { currentSlug }: { currentSlug?: string } = $props()

  let query = $state('')
  const trimmed = $derived(query.trim().toLowerCase())

  const matches = $derived.by(() => {
    if (!trimmed) return null
    return new Set(
      DOC_PAGES.filter((page) => pageSearchText(page).includes(trimmed)).map((p) => p.slug),
    )
  })
</script>

<div class="space-y-4 rounded-lg border border-border bg-card p-3">
  <div class="relative">
    <Search
      class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
    <input
      type="search"
      bind:value={query}
      placeholder="Search docs"
      aria-label="Search documentation"
      class="w-full rounded-md border border-border bg-background py-2 pl-8 pr-8 text-sm outline-none focus:border-primary/60"
    />
  </div>

  <Link
    to="/docs"
    class={cn(
      'flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-accent',
      !currentSlug && 'bg-accent text-primary',
    )}
  >
    <BookOpen class="h-4 w-4" />
    Docs overview
  </Link>

  {#if matches?.size === 0}
    <p class="px-2 text-sm text-muted-foreground">No pages match “{query.trim()}”.</p>
  {/if}

  {#each DOC_GROUPS as group (group)}
    {@const pages = DOC_PAGES.filter(
      (page) => page.category === group && (matches === null || matches.has(page.slug)),
    )}
    {#if pages.length > 0}
      <div class="space-y-1">
        <p class="px-2 text-xs font-semibold uppercase tracking-wide text-primary">
          {group}
        </p>
        {#each pages as page (page.slug)}
          <Link
            to="/docs/$slug"
            params={{ slug: page.slug }}
            class={cn(
              'block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground',
              currentSlug === page.slug && 'bg-accent text-foreground',
            )}
          >
            {page.title}
          </Link>
        {/each}
      </div>
    {/if}
  {/each}
</div>
