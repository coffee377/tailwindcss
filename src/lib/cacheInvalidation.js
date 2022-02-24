import crypto from 'crypto'
import * as sharedState from './sharedState'

/**
 *
 * @param {string} str
 */
function getHash(str) {
  try {
    return crypto.createHash('md5').update(str, 'utf-8').digest('binary')
  } catch (err) {
    return ''
  }
}

/**
 * @param {string} sourcePath
 * @param {import('postcss').Node} root
 */
export function hasContentChanged(sourcePath, root) {
  let css = root.toString()

  // We only care about files with @tailwind directives
  // Other files use an existing context
  if (!css.includes('@tailwind')) {
    return false
  }

  let existingHash = sharedState.sourceHashMap.get(sourcePath)
  let rootHash = getHash(css)
  let didChange = existingHash !== rootHash

  sharedState.sourceHashMap.set(sourcePath, rootHash)

  return didChange
}
