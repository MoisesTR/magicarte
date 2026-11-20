import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

for (const [path, handler, business] of [
  ['src/pages/Orders.jsx', 'handleSubmit', 'currentBusinessId'],
  ['src/pages/hikari/Orders.jsx', 'handleSave', 'currentBusinessId'],
  ['src/components/QuickEngravingForm.jsx', 'handleSave', 'businessId'],
]) test(`${path} resolves client before insert/update and preserves conversion after items`, async () => {
  const source = await readFile(path, 'utf8')
  const save = source.slice(source.indexOf(`const ${handler} = async`))
  const resolveIndex = save.indexOf('await resolveOrderClient(')
  assert.ok(resolveIndex >= 0, 'save handler awaits client resolution')
  assert.ok(resolveIndex < save.indexOf('await createOrder('), 'client resolved before insert')
  assert.ok(resolveIndex < save.indexOf('await updateOrder('), 'client resolved before eligible edit')
  assert.match(save, /client_id:\s*clientId/)
  assert.match(save, new RegExp(`businessId: ${business}`))
  assert.match(save, /!editingOrder \|\| \(!.*client_id && .*customer_name/)
  assert.ok(save.indexOf('completeConversion(orderId)') > save.indexOf('await insertOrderItems('))
  assert.match(save, /console\.error\('Error linking order client:', error\)/)
  assert.ok(save.indexOf('Pedido guardado, pero no se pudo vincular el cliente.') > save.indexOf('await insertOrderItems('))
})
