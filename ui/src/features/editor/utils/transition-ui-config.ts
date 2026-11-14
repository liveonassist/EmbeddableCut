// SPDX-License-Identifier: MIT

/**
 * Shared transition UI configuration.
 * Single source of truth for transition presentation configs,
 * icons, and category metadata — derived from the transition registry.
 */

import Blend from 'lucide-svelte/icons/blend'
import ArrowRight from 'lucide-svelte/icons/arrow-right'
import ArrowLeft from 'lucide-svelte/icons/arrow-left'
import ArrowUp from 'lucide-svelte/icons/arrow-up'
import ArrowDown from 'lucide-svelte/icons/arrow-down'
import Asterisk from 'lucide-svelte/icons/asterisk'
import Columns2 from 'lucide-svelte/icons/columns-2'
import MoveRight from 'lucide-svelte/icons/move-right'
import MoveLeft from 'lucide-svelte/icons/move-left'
import MoveUp from 'lucide-svelte/icons/move-up'
import MoveDown from 'lucide-svelte/icons/move-down'
import FlipHorizontal from 'lucide-svelte/icons/flip-horizontal'
import FlipVertical from 'lucide-svelte/icons/flip-vertical'
import Clock from 'lucide-svelte/icons/clock'
import Circle from 'lucide-svelte/icons/circle'
import Diamond from 'lucide-svelte/icons/diamond'
import Eye from 'lucide-svelte/icons/eye'
import Hexagon from 'lucide-svelte/icons/hexagon'
import Heart from 'lucide-svelte/icons/heart'
import Pentagon from 'lucide-svelte/icons/pentagon'
import Plus from 'lucide-svelte/icons/plus'
import RectangleHorizontal from 'lucide-svelte/icons/rectangle-horizontal'
import RotateCw from 'lucide-svelte/icons/rotate-cw'
import Rows3 from 'lucide-svelte/icons/rows-3'
import Rows4 from 'lucide-svelte/icons/rows-4'
import Square from 'lucide-svelte/icons/square'
import Sparkles from 'lucide-svelte/icons/sparkles'
import Star from 'lucide-svelte/icons/star'
import Triangle from 'lucide-svelte/icons/triangle'
import Zap from 'lucide-svelte/icons/zap'
import Sun from 'lucide-svelte/icons/sun'
import Waves from 'lucide-svelte/icons/waves'
import ScanSearch from 'lucide-svelte/icons/scan-search'
import SplitSquareVertical from 'lucide-svelte/icons/split-square-vertical'
import PanelTopOpen from 'lucide-svelte/icons/panel-top-open'
import X from 'lucide-svelte/icons/x'
import Flame from 'lucide-svelte/icons/flame'
import Film from 'lucide-svelte/icons/film'
import Droplet from 'lucide-svelte/icons/droplet'
import Layers from 'lucide-svelte/icons/layers'
import Aperture from 'lucide-svelte/icons/aperture'
import CircleDot from 'lucide-svelte/icons/circle-dot'
import type { Icon as LucideIcon } from 'lucide-svelte'
import { transitionRegistry } from '@/shared/timeline/transitions'
import type { PresentationConfig, TransitionCategory } from '@/types/transition'

/** Lucide icon lookup by name string */
export const TRANSITION_ICON_MAP: Record<string, typeof LucideIcon> = {
  Blend,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Asterisk,
  Columns2,
  MoveRight,
  MoveLeft,
  MoveDown,
  MoveUp,
  FlipHorizontal,
  FlipHorizontal2: FlipHorizontal,
  FlipVertical,
  FlipVertical2: FlipVertical,
  Clock,
  Circle,
  Diamond,
  Eye,
  Hexagon,
  Heart,
  Pentagon,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Rows3,
  Rows4,
  Square,
  Sparkles,
  Star,
  Triangle,
  Zap,
  Sun,
  Waves,
  ScanSearch,
  SplitSquareVertical,
  PanelTopOpen,
  X,
  Flame,
  Film,
  Droplet,
  Layers,
  Aperture,
  CircleDot,
}

/** i18n keys for transition category display labels */
export const TRANSITION_CATEGORY_INFO: Record<string, { titleKey: string }> = {
  basic: { titleKey: 'editor.transitions.category.basic' },
  dissolve: { titleKey: 'editor.transitions.category.dissolve' },
  motion: { titleKey: 'editor.transitions.category.motion' },
  wipe: { titleKey: 'editor.transitions.category.wipe' },
  slide: { titleKey: 'editor.transitions.category.slide' },
  flip: { titleKey: 'editor.transitions.category.flip' },
  mask: { titleKey: 'editor.transitions.category.mask' },
  iris: { titleKey: 'editor.transitions.category.iris' },
  shape: { titleKey: 'editor.transitions.category.shape' },
  light: { titleKey: 'editor.transitions.category.light' },
  chromatic: { titleKey: 'editor.transitions.category.chromatic' },
  custom: { titleKey: 'editor.transitions.category.custom' },
}

/** Ordered list of categories for UI rendering */
export const TRANSITION_CATEGORY_ORDER: TransitionCategory[] = [
  'basic',
  'dissolve',
  'motion',
  'wipe',
  'mask',
  'iris',
  'shape',
  'custom',
]

/** Direction string â†’ display label + icon name */
function createConfigsForDefinition(
  def: ReturnType<typeof transitionRegistry.getDefinitions>[number],
): PresentationConfig[] {
  return [
    {
      id: def.id,
      label: def.label,
      description: def.description,
      icon: def.icon,
      category: def.category,
      directions: def.hasDirection ? def.directions : undefined,
      defaultDirection: def.hasDirection ? def.directions?.[0] : undefined,
    },
  ]
}

/**
 * Generate PresentationConfig array from the transition registry.
 * Directional transitions produce one config and expose direction as a property.
 * The flat list is grouped in the same category order used by picker UIs so
 * category-based index math stays stable.
 */
function generateConfigsFromRegistry(): PresentationConfig[] {
  const groupedConfigs = new Map<string, PresentationConfig[]>()
  const uncategorizedConfigs: PresentationConfig[] = []
  const categoryOrder = new Set<string>(TRANSITION_CATEGORY_ORDER)

  for (const def of transitionRegistry.getDefinitions()) {
    const configs = createConfigsForDefinition(def)
    if (!categoryOrder.has(def.category)) {
      uncategorizedConfigs.push(...configs)
      continue
    }

    const existing = groupedConfigs.get(def.category) ?? []
    existing.push(...configs)
    groupedConfigs.set(def.category, existing)
  }

  return [
    ...TRANSITION_CATEGORY_ORDER.flatMap((category) => groupedConfigs.get(category) ?? []),
    ...uncategorizedConfigs,
  ]
}

// Lazy-initialized caches — avoids TDZ when bundler orders this module
// before the transition registry is populated (see CLAUDE.md gotchas).
let _presentationConfigs: PresentationConfig[] | null = null
let _configsByCategory: Record<string, PresentationConfig[]> | null = null
let _categoryStartIndices: Record<string, number> | null = null

function ensureInitialized(): void {
  if (_presentationConfigs) return

  _presentationConfigs = generateConfigsFromRegistry()
  _configsByCategory = {}
  _categoryStartIndices = {}

  for (const config of _presentationConfigs) {
    if (!_configsByCategory[config.category]) {
      _configsByCategory[config.category] = []
    }
    _configsByCategory[config.category]!.push(config)
  }

  let running = 0
  for (const category of TRANSITION_CATEGORY_ORDER) {
    _categoryStartIndices[category] = running
    running += _configsByCategory[category]?.length || 0
  }
}

/** All presentation configs, generated once from the registry */
export function getTransitionPresentationConfigs(): PresentationConfig[] {
  ensureInitialized()
  return _presentationConfigs!
}

/** Configs grouped by category (for picker UIs) */
export function getTransitionConfigsByCategory(): Record<string, PresentationConfig[]> {
  ensureInitialized()
  return _configsByCategory!
}

/** Start indices per category (for flat-list indexing) */
export function getTransitionCategoryStartIndices(): Record<string, number> {
  ensureInitialized()
  return _categoryStartIndices!
}
