const fs = require('fs')
const path = require('path')
const postcss = require('postcss')
const tailwind = require('../src/index.js')
const sharedState = require('../src/lib/sharedState.js')
const configPath = path.resolve(__dirname, './context-reuse.tailwind.config.js')
const { css } = require('./util/run.js')

function run(input, config = {}, from = null) {
  from = from || path.resolve(__filename)

  return postcss(tailwind(config)).process(input, { from })
}

beforeEach(async () => {
  let config = {
    content: [path.resolve(__dirname, './context-reuse.test.html')],
    corePlugins: { preflight: false },
  }

  await fs.promises.writeFile(configPath, `module.exports = ${JSON.stringify(config)};`)
})

afterEach(async () => {
  await fs.promises.unlink(configPath)
})

it('a build re-uses the context across multiple files with the same config', async () => {
  let from = path.resolve(__filename)

  let results = [
    await run(`@tailwind utilities;`, configPath, `${from}?id=1`),

    // Using @apply directives should still re-use the context
    // They depend on the config but do not the other way around
    await run(`body { @apply bg-blue-400; }`, configPath, `${from}?id=2`),
    await run(`body { @apply text-red-400; }`, configPath, `${from}?id=3`),
    await run(`body { @apply mb-4; }`, configPath, `${from}?id=4`),
  ]

  let dependencies = results.map((result) => {
    return result.messages
      .filter((message) => message.type === 'dependency')
      .map((message) => message.file)
  })

  // The content files don't have any utilities in them so this should be empty
  expect(results[0].css).toMatchFormattedCss(css``)

  // However, @apply is being used so we want to verify that they're being inlined into the CSS rules
  expect(results[1].css).toMatchFormattedCss(css`
    body {
      --tw-bg-opacity: 1;
      background-color: rgb(96 165 250 / var(--tw-bg-opacity));
    }
  `)

  expect(results[2].css).toMatchFormattedCss(css`
    body {
      --tw-text-opacity: 1;
      color: rgb(248 113 113 / var(--tw-text-opacity));
    }
  `)

  expect(results[3].css).toMatchFormattedCss(css`
    body {
      margin-bottom: 1rem;
    }
  `)

  // Files with @tailwind directives depends on the PostCSS tree, config, AND any content files
  expect(dependencies[0]).toEqual([
    path.resolve(__dirname, 'context-reuse.test.html'),
    path.resolve(__dirname, 'context-reuse.tailwind.config.js'),
  ])

  // @apply depends only on the containing PostCSS tree *and* the config file but no content files
  // as they cannot affect the outcome of the @apply directives
  expect(dependencies[1]).toEqual([path.resolve(__dirname, 'context-reuse.tailwind.config.js')])

  expect(dependencies[2]).toEqual([path.resolve(__dirname, 'context-reuse.tailwind.config.js')])

  expect(dependencies[3]).toEqual([path.resolve(__dirname, 'context-reuse.tailwind.config.js')])

  // And none of this should have resulted in multiple contexts being created
  expect(sharedState.contextSourcesMap.size).toBe(1)
})

it('passing in different css invalidates the context if it contains @tailwind directives', async () => {
  sharedState.contextInvalidationCount = 0

  let from = path.resolve(__filename)

  // Save the file a handful of times with no changes
  // This builds the context at most once
  for (let n = 0; n < 5; n++) {
    await run(`@tailwind utilities;`, configPath, `${from}?id=1`)
  }

  expect(sharedState.contextInvalidationCount).toBe(1)

  // Save the file twice with a change
  // This should rebuild the context again but only once
  await run(`@tailwind utilities; .foo {}`, configPath, `${from}?id=1`)
  await run(`@tailwind utilities; .foo {}`, configPath, `${from}?id=1`)

  expect(sharedState.contextInvalidationCount).toBe(2)

  // Save the file twice with a content but not length change
  // This should rebuild the context two more times
  await run(`@tailwind utilities; .bar {}`, configPath, `${from}?id=1`)
  await run(`@tailwind utilities; .baz {}`, configPath, `${from}?id=1`)

  expect(sharedState.contextInvalidationCount).toBe(4)

  // Save a file with a change that does not affect the context
  // No invalidation should occur
  await run(`.foo { @apply mb-1; }`, configPath, `${from}?id=2`)
  await run(`.foo { @apply mb-1; }`, configPath, `${from}?id=2`)
  await run(`.foo { @apply mb-1; }`, configPath, `${from}?id=2`)

  expect(sharedState.contextInvalidationCount).toBe(4)
})
