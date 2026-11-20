import test from 'node:test'
import assert from 'node:assert/strict'
import { AI_TAGS, aiTagChip, isAITag } from '../src/utils/whatsappTags.js'
import { groupThreads, rowChip } from '../src/utils/whatsappFeed.js'
const now = '2026-11-20T04:00:00Z' // Nov 19 in Managua
const open = (id, fields = {}) => ({
  id,
  status: 'sent',
  kind: 'quote',
  ...fields,
})
const group = (rows, key) =>
  groupThreads(rows, now).find((g) => g.key === key).threads

test('AI catalog has exactly the nine Spanish labels and accepts only own keys', () => {
  assert.deepEqual(
    Object.values(AI_TAGS).map((tag) => tag.label),
    [
      'Prometiste algo',
      'Dar seguimiento',
      'Cliente lo está pensando',
      'Lead nuevo',
      'Por cotizar',
      'Esperando pago',
      'Pagó',
      'Cliente espera respuesta',
      'No es cliente',
    ]
  )
  for (const tag of Object.keys(AI_TAGS)) assert.equal(isAITag(tag), true)
  for (const tag of [null, undefined, '', 'toString', '__proto__', 'other'])
    assert.equal(isAITag(tag), false)
})
test('null/unknown AI tags have no chip and promised tone follows only its Managua due date', () => {
  assert.equal(aiTagChip({ ai_tag: null }, now), null)
  assert.equal(aiTagChip({ ai_tag: 'toString' }, now), null)
  assert.deepEqual(
    aiTagChip({ ai_tag: 'promised', promised_date: '2026-11-19' }, now),
    { text: 'Prometiste algo', tone: 'warning' }
  )
  assert.equal(
    aiTagChip({ ai_tag: 'promised', promised_date: '2026-11-18' }, now).tone,
    'danger'
  )
  assert.equal(
    aiTagChip(
      {
        ai_tag: 'promised',
        follow_up_date: '2026-11-18',
        promised_date: '2026-11-20',
      },
      now
    ).tone,
    'neutral'
  )
  assert.equal(aiTagChip({ ai_tag: 'customer_waiting' }, now).tone, 'danger')
  assert.equal(aiTagChip({ ai_tag: 'paid' }, now).tone, 'success')
})
test('promise chip ignores earlier follow-up and non-promised tags suppress stale promises', () => {
  for (const ai_tag of [null, undefined, 'promised']) {
    assert.deepEqual(
      rowChip(
        open('p', {
          ai_tag,
          promised_date: '2026-11-19',
          follow_up_date: '2026-11-17',
        }),
        now
      ),
      { text: 'Prometido hoy', tone: 'warning' }
    )
    assert.deepEqual(
      rowChip(open('p', { ai_tag, promised_date: '2026-11-18' }), now),
      { text: 'Vencido 1 d', tone: 'danger' }
    )
  }
  for (const ai_tag of Object.keys(AI_TAGS).filter((tag) => tag !== 'promised'))
    assert.doesNotMatch(
      rowChip(open('p', { ai_tag, promised_date: '2026-11-01' }), now).text,
      /Prometido|Vencido/
    )
})
test('follow-ups have distinct today/overdue chips, including a future promise', () => {
  assert.deepEqual(rowChip(open('f', { follow_up_date: '2026-11-19' }), now), {
    text: 'Seguimiento hoy',
    tone: 'warning',
  })
  assert.deepEqual(
    rowChip(
      open('f', { follow_up_date: '2026-11-17', promised_date: '2026-12-01' }),
      now
    ),
    { text: 'Seguimiento vencido 2 d', tone: 'danger' }
  )
})
test('only promise/customer waiting tags create response tasks; awaiting replies stay in Sin responder', () => {
  const rows = [
    open('promise', { ai_tag: 'promised' }),
    open('wait', { ai_tag: 'customer_waiting' }),
    open('due', { promised_date: '2026-11-19' }),
    open('reply', {
      ai_tag: 'promised',
      awaiting_reply: true,
      promised_date: '2026-11-18',
    }),
    open('follow', {
      ai_tag: 'follow_up',
      promised_date: '2026-11-01',
      follow_up_date: '2026-11-19',
    }),
  ]
  assert.deepEqual(
    new Set(group(rows, 'today').map((t) => t.id)),
    new Set(['promise', 'wait', 'due'])
  )
  assert.deepEqual(
    group(rows, 'unanswered').map((t) => t.id),
    ['reply']
  )
  assert.deepEqual(
    group(rows, 'waiting').map((t) => t.id),
    ['follow']
  )
  assert.equal(
    groupThreads(rows, now).flatMap((g) => g.threads).length,
    rows.length
  )
})
test('due follow-ups sort first in waiting even if to_quote; no mutation', () => {
  const rows = [
    open('old', { last_our_message_at: '2026-11-01T12:00:00Z' }),
    open('today', { status: 'to_quote', follow_up_date: '2026-11-19' }),
    open('overdue', { follow_up_date: '2026-11-18' }),
    open('future', { follow_up_date: '2026-11-20' }),
  ]
  const before = structuredClone(rows)
  assert.deepEqual(
    group(rows, 'waiting').map((t) => t.id),
    ['overdue', 'today', 'old', 'future']
  )
  assert.equal(group(rows, 'waiting')[1].timeHint, 'Seguimiento hoy')
  assert.deepEqual(rows, before)
})
test('payment and confirmed priorities remain independent of AI reply tags', () => {
  const rows = [
    open('payment', {
      kind: 'payment',
      ai_tag: 'promised',
      awaiting_reply: true,
      follow_up_date: '2026-11-19',
    }),
    open('confirmed', {
      paid_amount: 1,
      ai_tag: 'customer_waiting',
      promised_date: '2026-11-18',
      awaiting_reply: true,
    }),
  ]
  assert.deepEqual(
    group(rows, 'payments').map((t) => t.id),
    ['payment']
  )
  assert.deepEqual(
    group(rows, 'confirmed').map((t) => t.id),
    ['confirmed']
  )
  assert.deepEqual(rowChip(rows[0], now), {
    text: 'Revisar hoy',
    tone: 'warning',
  })
})
