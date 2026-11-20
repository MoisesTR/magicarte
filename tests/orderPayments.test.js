import test from 'node:test'
import assert from 'node:assert/strict'
import * as orderPayments from '../src/utils/orderPayments.js'
import { summarisePayments } from '../src/utils/finance.js'
import { getOrderChargeTotal, getPaymentSummary } from '../src/utils/orderPayments.js'

test('order charge includes delivery and preserves Orders numeric coercion', () => {
  assert.equal(getOrderChargeTotal({ total_amount: '100.50', delivery_fee: '20' }), 120.5)
  assert.equal(getOrderChargeTotal({ total_amount: null, delivery_fee: 'invalid' }), 0)
})
test('payment summary preserves gross, card commission, net and balance', () => {
  const payments = [{ amount: '40', method: 'tarjeta' }, { amount: 10, method: 'efectivo' }]
  assert.deepEqual(getPaymentSummary(payments, 120), {
    payments, paid: 50, paidCard: 40, commission: 2.7, net: 47.3, balance: 70, status: 'partial',
  })
})
test('payment summary ignores stored payment status, clamps overpayment and preserves tolerance', () => {
  assert.equal(getPaymentSummary([{ amount: 101 }], 100).balance, 0)
  assert.equal(getPaymentSummary([{ amount: 99.995 }], 100).status, 'paid')
  assert.equal(getPaymentSummary(null, 0).status, 'unpaid')
  assert.equal(getPaymentSummary([{ amount: 'bad' }], 20).balance, 20)
})


test('billable rule excludes only backlog and canceled, including all live status keys', () => {
  assert.equal(typeof orderPayments.isBillableOrder, 'function')
  for (const status of ['pending', 'confirmed', 'in_progress', 'ready', 'completed', 'future_status']) {
    assert.equal(orderPayments.isBillableOrder({ status }), true, status)
  }
  for (const status of ['backlog', 'canceled']) assert.equal(orderPayments.isBillableOrder({ status }), false)
})

test('charges, gross receipts and balances use integer cents, including decimal ties', () => {
  assert.equal(getOrderChargeTotal({ total_amount: 0.1, delivery_fee: 0.2 }), 0.3)
  assert.equal(getOrderChargeTotal({ total_amount: '10.075', delivery_fee: '1.005' }), 11.09)
  const summary = getPaymentSummary([{ amount: 0.1 }, { amount: 0.2 }], 0.3)
  assert.equal(summary.paid, 0.3)
  assert.equal(summary.balance, 0)
  assert.equal(summary.status, 'paid')
  assert.equal(getPaymentSummary([{ amount: 0.1 }], 0.3).balance, 0.2)
  assert.equal(getPaymentSummary([{ amount: 0.31 }], 0.3).status, 'paid')
})

test('receivables sum delivery-inclusive billable orders and clamp each debt before aggregating', () => {
  assert.equal(typeof orderPayments.summarizeReceivables, 'function')
  const orders = ['pending', 'confirmed', 'in_progress', 'ready', 'completed'].map(status => ({
    status, total_amount: '0.10', delivery_fee: 0.2, order_payments: [{ amount: 0.1 }],
  }))
  orders.push({ status: 'completed', total_amount: 1, order_payments: [{ amount: 2 }] },
    { status: 'backlog', total_amount: 1000, order_payments: [{ amount: 10 }] },
    { status: 'canceled', total_amount: 1000 })
  assert.deepEqual(orderPayments.summarizeReceivables(orders), { totalCharged: 2.5, totalPaid: 2.5, pending: 1, count: 6 })
  assert.deepEqual(orderPayments.summarizeReceivables([]), { totalCharged: 0, totalPaid: 0, pending: 0, count: 0 })
})

test('cash-flow aggregation delegates gross cents while preserving card commission semantics', () => {
  const payments = [{ amount: 0.1, method: 'tarjeta' }, { amount: 0.2, method: 'tarjeta' }, { amount: 'bad' }]
  const summary = summarisePayments(payments)
  assert.equal(summary.paid, 0.3)
  assert.equal(summary.paidCard, 0.3)
  assert.deepEqual(summary, (({ paid, paidCard, commission, net }) => ({ paid, paidCard, commission, net }))(getPaymentSummary(payments, 1)))
})
