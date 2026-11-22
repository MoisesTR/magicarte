import test from 'node:test'
import assert from 'node:assert/strict'
import { activeCampaign, campaigns, campaignBannerText, campaignCategory, campaignStatus, isSeasonalBannerActive } from '../src/utils/seasonalCampaigns.js'
import { getMothersDay } from '../src/utils/holidays.js'

const atNoon = date => new Date(`${date}T18:00:00Z`)
const christmas = () => campaigns.find(campaign => campaign.id === 'christmas')

test('Christmas runs November 15 through December 24 inclusive in Managua', () => {
  for (const [day, expected] of [['2026-11-14', null], ['2026-11-15', 'christmas'], ['2026-12-24', 'christmas'], ['2026-12-25', null]]) {
    assert.equal(activeCampaign(atNoon(day))?.id ?? null, expected, day)
    assert.equal(isSeasonalBannerActive(atNoon(day)), false, `${day}: Christmas has no top banner without a deadline`)
  }
})

test('Managua evening is not the next UTC calendar day at Christmas boundaries', () => {
  for (const [instant, expected] of [
    ['2026-11-15T00:00:00Z', null], ['2026-11-15T05:59:59Z', null],
    ['2026-11-15T06:00:00Z', 'christmas'], ['2026-12-25T00:00:00Z', 'christmas'],
    ['2026-12-25T05:59:59Z', 'christmas'], ['2026-12-25T06:00:00Z', null],
  ]) assert.equal(activeCampaign(new Date(instant))?.id ?? null, expected, instant)
})

test('Mother campaign preserves daysLeft 20 through zero including all of May 30', () => {
  for (const [day, expected, daysLeft] of [
    ['2026-05-09', false, 21], ['2026-05-10', true, 20], ['2026-05-11', true, 19],
    ['2026-05-29', true, 1], ['2026-05-30', true, 0], ['2026-05-31', false, -1],
  ]) {
    const now = atNoon(day)
    assert.deepEqual(getMothersDay(now), { isActive: expected, daysLeft })
    assert.deepEqual(campaignStatus('mothers-day', now), getMothersDay(now))
    assert.equal(activeCampaign(now)?.id ?? null, expected ? 'mothers-day' : null)
  }
  assert.equal(getMothersDay(new Date('2026-05-31T05:59:59Z')).isActive, true)
  assert.equal(getMothersDay(new Date('2026-05-31T06:00:00Z')).isActive, false)
})

test('annual configuration selects at most one campaign on every day', () => {
  assert.equal(new Set(campaigns.map(campaign => campaign.id)).size, campaigns.length)
  for (let day = Date.parse('2026-01-01T18:00:00Z'); day < Date.parse('2027-01-01T18:00:00Z'); day += 86400000) {
    const now = new Date(day)
    const active = campaigns.filter(campaign => campaignStatus(campaign.id, now).isActive)
    assert.ok(active.length <= 1)
    assert.equal(activeCampaign(now)?.id ?? null, active[0]?.id ?? null)
  }
  assert.equal(activeCampaign(atNoon('2027-11-15'))?.id, 'christmas')
})

test('Christmas banner copy supports an optional order deadline', () => {
  assert.equal(christmas().orderDeadline, null)
  assert.equal(campaignBannerText(christmas()), null, 'no top banner without an order deadline')
  assert.equal(campaignBannerText({ ...christmas(), orderDeadline: '18 de diciembre' }), '🎄 Pedidos para Navidad hasta el 18 de diciembre')
})

test('seasonal banner slot is active only when the campaign has banner text', () => {
  assert.equal(isSeasonalBannerActive(atNoon('2026-12-01')), false)
  assert.equal(isSeasonalBannerActive(atNoon('2026-05-20')), true)
  assert.equal(isSeasonalBannerActive(atNoon('2026-07-01')), false)
})

test('Mother banner countdown retains its messages using formal usted copy', () => {
  const mother = campaigns.find(campaign => campaign.id === 'mothers-day')
  for (const [daysLeft, fragment] of [[0, 'Sorprenda a su mamá'], [1, 'hacer su pedido'], [4, 'Haga su pedido ahora'], [20, 'Regale algo único']]) {
    assert.ok(campaignBannerText({ ...mother, daysLeft }).includes(fragment))
  }
})

test('Christmas CTA resolves only the exact Navidad category and safely omits missing categories', () => {
  const christmasCategory = { id: 2, name: 'Navidad' }
  const categories = [{ id: 0, name: 'Todos' }, { id: 1, name: 'Otra' }, christmasCategory]
  assert.equal(campaignCategory(christmas(), categories), christmasCategory)
  assert.equal(campaignCategory(christmas(), [{ name: 'navidad' }, { name: 'Navidad 2026' }]), null)
  assert.equal(campaignCategory(christmas(), []), null)
  assert.equal(campaignCategory(christmas()), null)
  assert.equal(campaignCategory(campaigns.find(campaign => campaign.id === 'mothers-day'), categories), categories[1])
})

test('all campaign copy uses formal usted, not informal tú forms', () => {
  const copy = JSON.stringify(campaigns)
  assert.doesNotMatch(copy, /(?<![\p{L}\p{N}_])(?:tú|tu|tus|Regala|Sorprende|Haz)(?![\p{L}\p{N}_])/iu)
  assert.match(copy, /Regale amor a mamá/)
  assert.match(copy, /Personalizado con su mensaje/)
})
