import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shareCatalogFiles,
  saveCatalogToFolder,
  downloadCatalogFiles,
} from '../src/utils/catalogDelivery.js'

test('share sends actual files and title without awaiting other work first', async () => {
  const files = [{ name: 'a.jpg' }]
  const calls = []
  const promise = shareCatalogFiles(files, {
    share: (value) => {
      calls.push(value)
      return Promise.resolve()
    },
  })
  assert.deepEqual(calls, [{ files, title: 'Catálogo de Magic Arte' }])
  await promise
})
test('folder delivery picks once then writes and closes every named file', async () => {
  const calls = []
  const files = [{ name: '01-a.jpg' }, { name: '02-b.jpg' }]
  await saveCatalogToFolder(files, {
    showDirectoryPicker(options) {
      calls.push(['pick', options])
      return Promise.resolve({
        async getFileHandle(name, options) {
          calls.push(['file', name, options])
          return {
            async createWritable() {
              return {
                async write(file) {
                  calls.push(['write', file])
                },
                async close() {
                  calls.push(['close'])
                },
              }
            },
          }
        },
      })
    },
  })
  assert.deepEqual(calls[0], ['pick', { mode: 'readwrite' }])
  assert.deepEqual(
    calls.filter((call) => call[0] === 'write').map((call) => call[1]),
    files
  )
  assert.equal(calls.filter((call) => call[0] === 'close').length, 2)
})
test('downloads stagger each file and revoke all URLs even after click errors', async () => {
  const calls = []
  const files = [{ name: 'a.jpg' }, { name: 'b.jpg' }]
  const options = {
    documentObject: {
      createElement: () => ({
        click() {
          calls.push('click')
        },
        remove() {
          calls.push('remove')
        },
      }),
      body: { appendChild() {} },
    },
    urlApi: {
      createObjectURL: (file) => file.name,
      revokeObjectURL: (url) => calls.push(['revoke', url]),
    },
    delay: async (ms) => calls.push(['delay', ms]),
  }
  await downloadCatalogFiles(files, options)
  assert.equal(calls.filter((value) => value === 'click').length, 2)
  assert.ok(
    calls.some(
      (value) =>
        Array.isArray(value) && value[0] === 'delay' && value[1] === 250
    )
  )
  assert.deepEqual(
    calls
      .filter((value) => Array.isArray(value) && value[0] === 'revoke')
      .map((value) => value[1]),
    ['a.jpg', 'b.jpg']
  )
})
test('share and picker cancellation are silent but real errors propagate', async () => {
  const abort = Object.assign(new Error('cancel'), { name: 'AbortError' })
  await shareCatalogFiles([], {
    share() {
      return Promise.reject(abort)
    },
  })
  await saveCatalogToFolder([], {
    showDirectoryPicker() {
      return Promise.reject(abort)
    },
  })
  await assert.rejects(
    shareCatalogFiles([], {
      share() {
        return Promise.reject(new Error('denied'))
      },
    }),
    /denied/
  )
})
