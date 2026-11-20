import test from 'node:test'
import assert from 'node:assert/strict'
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
