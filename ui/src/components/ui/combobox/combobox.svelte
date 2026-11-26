<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { cn } from '$lib/cn'

  interface ComboboxOption {
    value: string
    label: string
    keywords?: readonly string[]
  }

  interface ComboboxProps {
    id?: string
    value: string
    options: readonly ComboboxOption[]
    onValueChange: (value: string) => void
    placeholder?: string
    searchPlaceholder?: string
    emptyMessage?: string
    disabled?: boolean
    class?: string
    triggerClass?: string
    contentClass?: string
  }

  let {
    id,
    value,
    options,
    onValueChange,
    placeholder = 'Select an option',
    searchPlaceholder = 'Search...',
    emptyMessage = 'No results found.',
    disabled = false,
    class: className,
    triggerClass,
    contentClass,
  }: ComboboxProps = $props()

  let open = $state(false)
  let query = $state('')
  let trigger = $state<HTMLButtonElement | null>(null)
  let contentWidth = $state<number>()

  const selectedOption = $derived(options.find((option) => option.value === value))

  $effect(() => {
    if (!open) {
      query = ''
      return
    }

    const node = trigger
    if (!node) {
      return
    }

    const updateWidth = () => {
      contentWidth = node.offsetWidth
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  })

  const filteredOptions = $derived.by(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return options
    }

    return options.filter((option) => {
      const haystacks = [option.label, option.value, ...(option.keywords ?? [])]
      return haystacks.some((entry) => entry.toLowerCase().includes(normalizedQuery))
    })
  })
</script>

<div class={cn('w-full', className)}>
  <Popover bind:open>
    <PopoverTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          {...id ? { id } : {}}
          bind:ref={trigger}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          {disabled}
          class={cn(
            'h-9 w-full justify-between bg-transparent px-3 font-normal shadow-sm',
            'hover:bg-transparent',
            !selectedOption && 'text-muted-foreground',
            triggerClass,
          )}
        >
          <span class="truncate">{selectedOption?.label ?? placeholder}</span>
          <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      {/snippet}
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class={cn('p-0', contentClass)}
      style={contentWidth ? `width: ${contentWidth}px` : undefined}
    >
      <div class="border-b p-2">
        <!-- svelte-ignore a11y_autofocus -->
        <Input bind:value={query} placeholder={searchPlaceholder} autofocus />
      </div>
      <ScrollArea class="max-h-72">
        <div class="p-1">
          {#if filteredOptions.length === 0}
            <div class="px-2 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          {:else}
            {#each filteredOptions as option (option.value)}
              {@const isSelected = option.value === value}
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                class={cn(
                  'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors',
                  'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                )}
                onclick={() => {
                  onValueChange(option.value)
                  open = false
                }}
              >
                <span class="truncate">{option.label}</span>
                <Check
                  class={cn('ml-2 h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
                />
              </button>
            {/each}
          {/if}
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</div>
