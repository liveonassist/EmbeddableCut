// SPDX-License-Identifier: MIT

import pkg from '../package.json'

/**
 * The SDK's own semver: what its API promises. Independent of the data
 * versions in `SCHEMA_VERSIONS`, which change only when the data does.
 */
export const SDK_VERSION: string = pkg.version
