import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { storefrontHomePath, storefrontProductPath } from '../src/utils/storefrontRoutes.js'

test('storefront paths match actual Magic Arte public routes, not other businesses', () => {
  assert.equal(storefrontHomePath('magicarte'), '/')
  assert.equal(storefrontProductPath('magicarte', 'abc'), '/product/abc')
  assert.equal(storefrontProductPath('magicarte', 'a/b'), '/product/a%2Fb')
  for (const slug of ['hikari', 'joyeria-trigueros', 'all', undefined]) {
    assert.equal(storefrontHomePath(slug), null)
    assert.equal(storefrontProductPath(slug, 'abc'), null)
  }
  assert.equal(storefrontProductPath('magicarte', null), null)
})
test('admin shell and product list/edit expose safe new-tab storefront links', async () => {
  const chrome = await readFile(new URL('../src/components/AdminChrome.jsx', import.meta.url), 'utf8')
  assert.match(chrome, /storefrontHomePath\(currentBusiness\?\.slug\)/)
  assert.match(chrome, /<a[\s\S]*?href=\{storefrontPath\}[\s\S]*?target='_blank'[\s\S]*?rel='noopener noreferrer'[\s\S]*?<svg[\s\S]*?Ver tienda/)
  const admin = await readFile(new URL('../src/pages/Admin.jsx', import.meta.url), 'utf8')
  for (const id of ['product.id', 'editingProduct.id']) assert.ok(admin.includes(`storefrontProductPath(currentBusiness?.slug, ${id})`))
  assert.equal((admin.match(/Ver en la tienda/g) || []).length, 2)
  const links = admin.match(/<a\b[\s\S]*?<\/a>/g).filter(link => link.includes('Ver en la tienda'))
  assert.equal(links.length, 2)
  for (const link of links) {
    assert.match(link, /target='_blank'/)
    assert.match(link, /rel='noopener noreferrer'/)
  }
  const routes = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(routes, /path='\/' element=\{<Home/)
  assert.match(routes, /path='\/product\/:id'/)
})
