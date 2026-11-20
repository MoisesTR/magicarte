import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as finance from '../src/utils/finance.js'
import { managuaDay } from '../src/utils/whatsappFeed.js'

for (const [instant, expected] of [
  ['2026-11-20T17:59:00-06:00', '2026-11-20'],
  ['2026-11-20T18:00:00-06:00', '2026-11-20'],
  ['2026-11-21T00:00:00-06:00', '2026-11-21'],
  ['2026-11-30T18:00:00-06:00', '2026-11-30'],
]) test(`Nicaragua calendar day at ${instant}`, () => {
  assert.equal(finance.nicaraguaToday(new Date(instant)), expected)
  assert.equal(managuaDay(instant), expected)
})

test('Managua today/week stays Monday–Sunday at UTC midnight, regardless of host timezone', () => {
  for (const timezone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
    const previous = process.env.TZ
    try {
      process.env.TZ = timezone
      const sunday = finance.nicaraguaWeek(new Date('2026-11-23T00:00:00Z'))
      assert.equal(sunday.today, '2026-11-22')
      assert.equal(sunday.weekStart, '2026-11-16')
      assert.equal(sunday.weekEnd, '2026-11-22')
      assert.deepEqual(sunday.days, ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
      const monday = finance.nicaraguaWeek(new Date('2026-11-23T06:00:00Z'))
      assert.equal(monday.today, '2026-11-23')
      assert.equal(monday.weekStart, '2026-11-23')
      assert.equal(monday.weekEnd, '2026-11-29')
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  }
})

for (const path of ['src/pages/Orders.jsx', 'src/pages/hikari/Orders.jsx', 'src/components/QuickEngravingForm.jsx']) {
  test(`${path} never derives a calendar day from an ISO timestamp`, async () => {
    const source = await readFile(path, 'utf8')
    assert.doesNotMatch(source, /\.toISOString\(\)\s*\.(?:split\(['"]T['"]\)\s*\[0\]|slice\(\s*0\s*,\s*10\s*\))/)
    assert.match(source, /nicaraguaToday/)
  })
}

test('order filters and relative defaults use the shared Managua calendar primitives', async () => {
  const source = await readFile('src/pages/Orders.jsx', 'utf8')
  assert.match(source, /nicaraguaWeek\(/)
  assert.match(source, /daysBetween\(nicaraguaToday\(\), deliveryDate\)/)
  assert.match(source, /addDays\(formData\.order_date \|\| nicaraguaToday\(\), days\)/)
  assert.match(source, /addDays\(nicaraguaToday\(\), days\)/)
  assert.doesNotMatch(source, /const today = new Date\(\)/)
})

test('Joyería month default follows Managua at the month boundary', async () => {
  const source = await readFile('src/pages/joyeria/Orders.jsx', 'utf8')
  assert.match(source, /const currentMonthKey = \(\) => nicaraguaToday\(\)\.slice\(0, 7\)/)
})
