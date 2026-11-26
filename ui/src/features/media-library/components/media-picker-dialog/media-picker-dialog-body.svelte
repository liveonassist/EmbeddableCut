<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Search from '@lucide/svelte/icons/search'
  import Loader2 from '@lucide/svelte/icons/loader-circle'
  import { Input } from '@/components/ui/input'
  import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import MediaPickerItem from './media-picker-item.svelte'

  interface MediaPickerDialogBodyProps {
    filterType?: 'video' | 'audio' | 'image'
    onSelect: (mediaId: string) => void
  }

  let { filterType, onSelect }: MediaPickerDialogBodyProps = $props()

  const mediaItems = select(useMediaLibraryStore, (s) => s.mediaItems)
  const isLoading = select(useMediaLibraryStore, (s) => s.isLoading)
  let searchQuery = $state('')

  const filteredItems = $derived.by(() => {
    let items = mediaItems.current

    if (filterType) {
      const mimePrefix = `${filterType}/`
      items = items.filter((m) => m.mimeType.startsWith(mimePrefix))
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      items = items.filter((m) => m.fileName.toLowerCase().includes(query))
    }

    return items
  })
</script>

<div class="space-y-4">
  <div class="relative">
    <Search
      class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
    />
    <Input placeholder={t('media.searchMedia')} bind:value={searchQuery} class="pl-9" />
  </div>

  <div class="max-h-[400px] overflow-y-auto space-y-1 pr-2">
    {#if isLoading.current}
      <div class="flex items-center justify-center py-8">
        <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    {:else if filteredItems.length === 0}
      <div class="text-center py-8 text-muted-foreground">
        {searchQuery
          ? t('media.picker.noSearchResults')
          : filterType
            ? t(`media.picker.noFilesFiltered.${filterType}`)
            : t('media.picker.noFiles')}
      </div>
    {:else}
      {#each filteredItems as media (media.id)}
        <MediaPickerItem {media} onSelect={() => onSelect(media.id)} />
      {/each}
    {/if}
  </div>
</div>
