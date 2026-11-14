// SPDX-License-Identifier: MIT

import { ContextMenu as ContextMenuPrimitive } from 'bits-ui'

export const ContextMenu = ContextMenuPrimitive.Root
export { default as ContextMenuTrigger } from './context-menu-trigger.svelte'
export { default as ContextMenuContent } from './context-menu-content.svelte'
export { default as ContextMenuItem } from './context-menu-item.svelte'
export { default as ContextMenuLabel } from './context-menu-label.svelte'
export { default as ContextMenuSeparator } from './context-menu-separator.svelte'
export { default as ContextMenuShortcut } from './context-menu-shortcut.svelte'
export { default as ContextMenuSubContent } from './context-menu-sub-content.svelte'
export { default as ContextMenuSubTrigger } from './context-menu-sub-trigger.svelte'
export const ContextMenuSub = ContextMenuPrimitive.Sub
