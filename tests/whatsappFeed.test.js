import test from 'node:test'
import assert from 'node:assert/strict'
import {
  managuaDay,
  addDays,
  groupThreads,
  feedKPIs,
  parseWhatsAppChat,
  detectPromise,
  loadOurSenders,
  saveOurSenders,
  threadOrderPrefill,
  STATUS_LABELS,
  KIND_LABELS,
} from '../src/utils/whatsappFeed.js'

const now = new Date('2026-11-20T04:00:00Z') // Nov 19 at 22:00 Managua
const open = (id, fields = {}) => ({
  id,
  status: 'to_quote',
  kind: 'quote',
  ...fields,
})
test('Managua date uses local day across UTC midnight; leap dates round trip', () => {
  assert.equal(managuaDay(now), '2026-11-19')
  assert.equal(managuaDay('2026-11-20T06:00:00Z'), '2026-11-20')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})
test('feed is mutually exclusive, ordered by urgency, and excludes old closed rows', () => {
  const rows = [
    open('today', { promised_date: '2026-11-19', awaiting_reply: true }),
    open('overdue', { follow_up_date: '2026-11-17' }),
    open('reply-new', {
      awaiting_reply: true,
      last_customer_message_at: '2026-11-19T20:00:00Z',
    }),
    open('reply-old', {
      awaiting_reply: true,
      last_customer_message_at: '2026-11-18T20:00:00Z',
    }),
    open('quote'),
    open('payment', { kind: 'payment', status: 'follow_up' }),
    open('waiting', {
      status: 'sent',
      last_our_message_at: '2026-11-17T14:00:00Z',
    }),
    open('closed', {
      status: 'won',
      status_changed_at: '2026-11-01T12:00:00Z',
      awaiting_reply: true,
      promised_date: '2026-11-01',
    }),
    open('old', { status: 'lost', status_changed_at: '2026-10-01T12:00:00Z' }),
  ]
  const groups = groupThreads(rows, now)
  assert.deepEqual(
    groups.map((g) => g.title),
    [
      'Para hoy',
      'Esperando tu respuesta',
      'Por cotizar',
      'Pagos pendientes',
      'Esperando al cliente',
      'Cerrados (30 días)',
    ]
  )
  assert.deepEqual(
    groups.map((g) => g.threads.map((t) => t.id)),
    [
      ['overdue', 'today'],
      ['reply-old', 'reply-new'],
      ['quote'],
      ['payment'],
      ['waiting'],
      ['closed'],
    ]
  )
  assert.equal(groups[0].threads[0].timeHint, 'Vencido hace 2 días')
  assert.equal(groups[0].threads[1].timeHint, 'Prometido hoy')
  assert.equal(groups[1].threads[1].timeHint, 'Escribió hace 8 h')
  assert.equal(groups[4].threads[0].timeHint, 'Sin respuesta hace 2 días')
  assert.deepEqual(feedKPIs(rows, now), {
    today: 2,
    unanswered: 3,
    toQuote: 5,
    payments: 1,
  })
})
test('earliest of both due dates wins; closed cutoff uses status change, not creation', () => {
  const groups = groupThreads(
    [
      open('two', {
        promised_date: '2026-12-01',
        follow_up_date: '2026-11-18',
      }),
      open('closed', {
        status: 'done',
        status_changed_at: '2026-11-19T12:00:00Z',
        created_at: '2025-01-01T12:00:00Z',
      }),
    ],
    now
  )
  assert.equal(groups[0].threads[0].timeHint, 'Vencido hace 1 días')
  assert.equal(groups[5].threads.length, 1)
})
test('status and kind labels match the Spanish contract', () => {
  assert.deepEqual(Object.values(STATUS_LABELS), [
    'Por cotizar',
    'Cotización enviada',
    'Dar seguimiento',
    'Ganada',
    'Perdida',
    'Cerrado',
  ])
  assert.deepEqual(Object.values(KIND_LABELS), [
    'Cotización',
    'Seguimiento',
    'Pago pendiente',
    'Pedido',
    'Otro',
  ])
})
test('24h phone transcript preserves multiline customer request and timestamps', () => {
  const chat = parseWhatsAppChat(
    '[21:30, 19/11/2026] +505 8288 8070: Buenas, quiero 20 llaveros\ncon el logo de mi negocio.\n[21:35, 19/11/2026] Ivonne Silva: Mañana le paso la cotización\n[21:36, 19/11/2026] +505 8288 8070: Perfecto, muchas gracias'
  )
  assert.equal(chat.chat_key, '50582888070')
  assert.equal(chat.customer_phone, '50582888070')
  assert.equal(chat.messages[0].at, '2026-11-20T03:30:00.000Z')
  assert.equal(
    chat.messages[0].text,
    'Buenas, quiero 20 llaveros\ncon el logo de mi negocio.'
  )
  assert.match(chat.summary, /20 llaveros/)
  assert.equal(chat.requested_at, chat.messages[0].at)
  assert.equal(chat.last_customer_message_at, chat.messages[2].at)
  assert.equal(chat.last_our_message_at, chat.messages[1].at)
  assert.equal(chat.awaiting_reply, true)
  assert.equal(chat.promised_date, '2026-11-20')
  assert.equal(chat.promise_source, 'Mañana le paso la cotización')
})
test('Nicaraguan p. m./a. m., named customers and midnight crossing use message date', () => {
  const chat = parseWhatsAppChat(
    '[11:58 p. m., 19/11/2026] María López: ¿Me cotiza una lámpara?\n[12:05 a. m., 20/11/2026] Ivonne Silva: Hoy le envío el precio'
  )
  assert.equal(chat.chat_key, 'name:maría lópez')
  assert.equal(chat.customer_name, 'María López')
  assert.equal(chat.messages[0].at, '2026-11-20T05:58:00.000Z')
  assert.equal(chat.messages[1].at, '2026-11-20T06:05:00.000Z')
  assert.equal(chat.awaiting_reply, false)
  assert.equal(chat.promised_date, '2026-11-20')
})
for (const [text, date] of [
  ['Mañana le paso la cotización', '2026-11-20'],
  ['Pasado mañana le comparto los diseños', '2026-11-21'],
  ['Hoy le confirmo', '2026-11-19'],
  ['El jueves le aviso', '2026-11-26'],
  ['El viernes le escribo', '2026-11-20'],
  ['Le mando el precio el 20/11', '2026-11-20'],
  ['Le envío la cotización el 20 de noviembre', '2026-11-20'],
  ['El 2 de enero le confirmo', '2027-01-02'],
])
  test(`promise detection: ${text}`, () => {
    assert.deepEqual(
      detectPromise(
        [{ at: '2026-11-20T03:00:00Z', sender: 'Ivonne Silva', text }],
        ['Ivonne Silva']
      ),
      { promisedDate: date, promiseSource: text, confidence: 'high' }
    )
  })
test('only actual promise verbs in our messages qualify; last promise wins', () => {
  assert.equal(
    detectPromise(
      [{ at: now, sender: 'Cliente', text: 'Mañana le paso la cotización' }],
      ['Ivonne Silva']
    ),
    null
  )
  assert.equal(
    detectPromise(
      [{ at: now, sender: 'Ivonne Silva', text: '¿Para mañana?' }],
      ['Ivonne Silva']
    ),
    null
  )
  assert.equal(
    detectPromise(
      [
        {
          at: now,
          sender: 'Ivonne Silva',
          text: 'Le envío el precio el 31/11',
        },
      ],
      ['Ivonne Silva']
    ),
    null
  )
  const messages = [
    { at: now, sender: 'Ivonne Silva', text: 'Mañana le aviso' },
    { at: now, sender: 'Ivonne Silva', text: 'Pasado mañana le confirmo' },
  ]
  assert.equal(
    detectPromise(messages, ['Ivonne Silva']).promisedDate,
    '2026-11-21'
  )
})
test('parser handles empty, malformed dates, no customer, and customizable ours safely', () => {
  assert.equal(parseWhatsAppChat('').chat_key, '')
  assert.equal(
    parseWhatsAppChat('[25:99, 31/11/2026] Cliente: hola').messages.length,
    0
  )
  assert.equal(
    parseWhatsAppChat('[9:05 p. m., 19/11/2026] Ivonne Silva: Hola').chat_key,
    ''
  )
  const chat = parseWhatsAppChat(
    '[9:05 p. m., 19/11/2026] Don Carlos: 2 rótulos por favor\n[9:06 p. m., 19/11/2026] Hikari: mañana le mando el precio',
    ['Hikari']
  )
  assert.equal(chat.chat_key, 'name:don carlos')
  assert.equal(chat.awaiting_reply, false)
  assert.equal(chat.promised_date, '2026-11-20')
})
test('sender preferences survive denied localStorage and reject corrupt stored values', () => {
  const denied = {
    getItem() {
      throw Error('denied')
    },
    setItem() {
      throw Error('denied')
    },
  }
  assert.deepEqual(loadOurSenders(denied), ['Ivonne Silva'])
  assert.doesNotThrow(() => saveOurSenders([' Hikari '], denied))
  assert.deepEqual(loadOurSenders({ getItem: () => '{bad' }), ['Ivonne Silva'])
  assert.deepEqual(loadOurSenders({ getItem: () => JSON.stringify([42]) }), [
    'Ivonne Silva',
  ])
  let value
  saveOurSenders([' Hikari ', 'Hikari'], {
    setItem: (_key, v) => {
      value = v
    },
  })
  assert.deepEqual(JSON.parse(value), ['Hikari'])
})
test('thread order mapping preserves identity and notes and uses a custom unpaid item', () => {
  const form = threadOrderPrefill(
    {
      customer_name: 'Carlos',
      customer_phone: '50582888070',
      client_id: 'client',
      summary: '20 llaveros',
      notes: 'Azules',
      quoted_amount: '450.50',
      promised_date: '2026-11-20',
    },
    '2026-11-19'
  )
  assert.equal(form.customer_name, 'Carlos')
  assert.equal(form.customer_phone, '82888070')
  assert.equal(form.client_id, 'client')
  assert.equal(form.notes, '20 llaveros\n\nAzules')
  assert.equal(form.items[0].unit_price, 450.5)
  assert.equal(form.items[0].is_custom, true)
  assert.equal(form.payment_status, 'unpaid')
  assert.equal(form.status, 'pending')
  assert.equal(form.estimated_delivery_date, '2026-11-20')
  assert.equal(
    threadOrderPrefill({ summary: 'Pendiente' }).items[0].unit_price,
    ''
  )
})
test('same-minute reply ordering follows transcript position rather than equal timestamps', () => {
  const chat = parseWhatsAppChat(
    '[21:30, 19/11/2026] +505 8888 7777: ¿Ya tiene el precio?\n[21:30, 19/11/2026] Ivonne Silva: Sí, C$ 500'
  )
  assert.equal(chat.awaiting_reply, false)
})
for (const [clock, iso] of [
  ['12:00 a. m.', '2026-11-19T06:00:00.000Z'],
  ['12:00 p. m.', '2026-11-19T18:00:00.000Z'],
  ['9:05 p. m.', '2026-11-20T03:05:00.000Z'],
  ['9:05 a. m.', '2026-11-19T15:05:00.000Z'],
  ['23:59', '2026-11-20T05:59:00.000Z'],
  ['0:01', '2026-11-19T06:01:00.000Z'],
])
  test(`Managua transcript clock ${clock}`, () =>
    assert.equal(
      parseWhatsAppChat(`[${clock}, 19/11/2026] Cliente: Buenas`).messages[0]
        .at,
      iso
    ))
for (const [text, date] of [
  ['El lunes le confirmo', '2026-11-23'],
  ['El martes le aviso', '2026-11-24'],
  ['El miércoles le escribo', '2026-11-25'],
  ['El sábado le mando los diseños', '2026-11-21'],
  ['El domingo le paso el precio', '2026-11-22'],
])
  test(`weekdays resolve after source message: ${text}`, () =>
    assert.equal(
      detectPromise([{ at: now, sender: 'Ivonne Silva', text }]).promisedDate,
      date
    ))
test('new year, Unicode copy whitespace, local eight-digit number, and CRLF continuation', () => {
  const chat = parseWhatsAppChat(
    '\u200e[11:59 p.\u202fm., 31/12/2026] 8288-8070: ¡Buenas!\r\nQuiero dos placas.\r\n[12:01 a. m., 1/1/2027] Ivonne Silva: Mañana le comparto los diseños'
  )
  assert.equal(chat.chat_key, '50582888070')
  assert.equal(chat.promised_date, '2027-01-02')
  assert.equal(chat.messages[0].text, '¡Buenas!\nQuiero dos placas.')
})
for (const text of [
  'No le envío el precio mañana',
  'Tal vez le aviso mañana',
  'Mañana le paso saludando',
])
  test(`no false promise: ${text}`, () =>
    assert.equal(
      detectPromise([{ at: now, sender: 'Ivonne Silva', text }]),
      null
    ))
