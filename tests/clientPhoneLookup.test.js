import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function harness(rows = [], error = null) {
  const requests = []
  const source = (await readFile('src/data/clients.js', 'utf8')).replace(/^import .*$/gm, '').replaceAll('export ', '')
  const client = { from(table) {
    const request = { table, filters: [] }; requests.push(request)
    return {
      select(columns) { request.columns = columns; return this },
      eq(...args) { request.filters.push(args); return this },
      ilike(column, pattern) { request.pattern = [column, pattern]; return this },
      order(column) { request.order = column; return this },
      range(from, to) {
        request.range = [from, to]
        const pattern = new RegExp('^' + request.pattern[1].replaceAll('%', '.*') + '$', 'i')
        const candidates = rows.filter(row => row.business_id === request.filters.find(([field]) => field === 'business_id')?.[1] && pattern.test(row.phone))
        return Promise.resolve({ data: error ? null : candidates.slice(from, to + 1), error })
      },
    }
  } }
  const normalizeClientPhone = value => { const digits = String(value || '').replace(/\D/g, ''); return digits.length === 11 && digits.startsWith('505') ? digits.slice(3) : digits }
  const find = new Function('supabase', 'TABLE', 'normalizeClientPhone', `${source}; return typeof findClientByNormalizedPhone === 'function' ? findClientByNormalizedPhone : null`)(client, { CLIENTS: 'clients' }, normalizeClientPhone)
  return { find, requests }
}

test('normalized lookup matches every phone format bidirectionally and is business scoped', async () => {
  for (const stored of ['84216792', '+505 8421 6792', '505-8421-6792', '(8421) 6792']) {
    const h = await harness([{ id: 'wrong-business', phone: stored, business_id: 'other' }, { id: 'match', phone: stored, business_id: 'business' }])
    assert.equal(typeof h.find, 'function')
    assert.equal((await h.find('+505 8421 6792', 'business')).data.id, 'match')
    assert.deepEqual(h.requests[0].filters, [['business_id', 'business']])
  }
})

test('normalized lookup compares complete digits rather than an international suffix', async () => {
  const h = await harness([{ id: 'foreign', phone: '+506 8421 6792', business_id: 'business' }, { id: 'local', phone: '+505 8421 6792', business_id: 'business' }])
  assert.equal(typeof h.find, 'function')
  assert.equal((await h.find('84216792', 'business')).data.id, 'local')
  assert.equal((await h.find('+506 8421 6792', 'business')).data.id, 'foreign')
})

test('normalized lookup pages false-positive candidates instead of creating duplicates after a row cap', async () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: String(i), phone: '1 8421 6792', business_id: 'business' }))
  rows.push({ id: 'match', phone: '+505 8421 6792', business_id: 'business' })
  const h = await harness(rows)
  assert.equal(typeof h.find, 'function')
  assert.equal((await h.find('84216792', 'business')).data.id, 'match')
  assert.ok(h.requests.length > 1)
  assert.ok(h.requests.every(request => request.order === 'id'))
})

test('normalized lookup refuses missing scope and skips empty phones without querying', async () => {
  const h = await harness()
  assert.equal(typeof h.find, 'function')
  assert.ok((await h.find('84216792', null)).error)
  assert.deepEqual(await h.find(' -- ', 'business'), { data: null, error: null })
  assert.equal(h.requests.length, 0)
})

test('normalized lookup returns database failures without masking them as no match', async () => {
  const failure = Error('denied'), h = await harness([], failure)
  assert.equal(typeof h.find, 'function')
  assert.equal((await h.find('84216792', 'business')).error, failure)
})

test('every order client resolver call site also passes the exact-name lookup', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const file of ['src/pages/Orders.jsx', 'src/pages/hikari/Orders.jsx', 'src/components/QuickEngravingForm.jsx']) {
    const source = await readFile(file, 'utf8')
    const calls = source.split('resolveOrderClient({').length - 1
    const named = source.split('findClientByName: findClientByExactName').length - 1
    assert.ok(calls > 0, file)
    assert.equal(named, calls, file)
  }
})
