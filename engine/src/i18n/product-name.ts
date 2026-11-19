// SPDX-License-Identifier: MIT

/**
 * What the editor's copy calls the product. Every string that names it says
 * `{{productName}}` instead, so a host shipping the editor under its own name
 * changes it in one place.
 */

import i18n from 'i18next'

export const DEFAULT_PRODUCT_NAME = 'EmbeddableCut'

/** Takes effect for strings rendered from now on; set it before mounting. */
export function setProductName(name: string = DEFAULT_PRODUCT_NAME): void {
  const interpolation = (i18n.options.interpolation ??= {})
  interpolation.defaultVariables = { ...interpolation.defaultVariables, productName: name }
}
