import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  KIND_LABELS,
  STATUS_LABELS,
  parseWhatsAppChat,
  loadOurSenders,
  saveOurSenders,
  buildThreadPayload,
  buildOrderLines,
} from '../../utils/whatsappFeed'
import { prepareFile, uploadCompressedImage } from '../../utils/uploadImage'
import { getImageUrl } from '../../utils/getImageUrl'
import { fetchClientsForBusiness } from '../../data/clients'

const inputClass =
  'mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800'
const button =
  'min-h-10 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50'
const EMPTY = {
  customer_name: '',
  customer_phone: '',
  chat_key: '',
  client_id: '',
  kind: 'quote',
  status: 'to_quote',
  summary: '',
  next_action: '',
  quoted_amount: '',
  delivery_date: '',
  delivery_method: '',
  delivery_address: '',
  recipient_name: '',
  recipient_phone: '',
  order_lines: [],
  paid_amount: 0,
  promised_date: '',
  promise_source: '',
  follow_up_date: '',
  awaiting_reply: false,
  unread_count: 0,
  labels: [],
  reference_images: [],
  order_id: '',
  lost_reason: '',
  notes: '',
  source: 'manual',
  requested_at: '',
  last_customer_message_at: '',
  last_our_message_at: '',
  last_reviewed_at: '',
}
const TEXT_FIELDS = [
  ['customer_name', 'Nombre del cliente'],
  ['customer_phone', 'Teléfono'],
  ['chat_key', 'Identificador del chat'],
  ['next_action', 'Próxima acción'],
  ['delivery_method', 'Forma de entrega'],
  ['promise_source', 'Promesa (texto exacto)'],
  ['order_id', 'ID de pedido vinculado'],
  ['lost_reason', 'Motivo de pérdida'],
]
const DATE_FIELDS = [
  ['delivery_date', 'Fecha de entrega'],
  ['promised_date', 'Fecha prometida'],
  ['follow_up_date', 'Fecha de seguimiento'],
]
const TIME_FIELDS = [
  ['requested_at', 'Solicitud recibida'],
  ['last_customer_message_at', 'Último mensaje del cliente'],
  ['last_our_message_at', 'Nuestro último mensaje'],
  ['last_reviewed_at', 'Última revisión'],
]

export default function ThreadEditor({
  thread,
  businessId,
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...thread,
    quoted_amount: thread?.quoted_amount ?? '',
    paid_amount: thread?.paid_amount ?? 0,
    order_lines: Array.isArray(thread?.order_lines) ? thread.order_lines.map(line => ({ ...line })) : [],
  }))
  const [pasted, setPasted] = useState(''),
    [ourSenders, setOurSenders] = useState(loadOurSenders),
    [clients, setClients] = useState([])
  const [lineErrors, setLineErrors] = useState([])
  const [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false)
  const dialog = useRef(null),
    closeButton = useRef(null),
    active = useRef(true)
  const parsed = parseWhatsAppChat(pasted, ourSenders)
  useEffect(() => {
    active.current = true
    const previous = document.activeElement
    closeButton.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    fetchClientsForBusiness(businessId).then(({ data, error }) => {
      if (active.current) {
        if (error) toast.error('No se pudieron cargar los clientes')
        else setClients(data || [])
      }
    })
    return () => {
      active.current = false
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [businessId])
  const update = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: value }))
  const toggleSender = (sender) => {
    const next = ourSenders.includes(sender)
      ? ourSenders.filter((name) => name !== sender)
      : [...ourSenders, sender]
    setOurSenders(next)
    saveOurSenders(next)
  }
  const applyChat = () => {
    if (!parsed.chat_key || !parsed.summary.trim()) {
      toast.error(
        'Seleccione quiénes son nosotros y verifique la conversación.'
      )
      return
    }
    const draft = Object.fromEntries(
      Object.entries(parsed).filter(
        ([key]) => !['messages', 'senders', 'promise_confidence'].includes(key)
      )
    )
    setForm((previous) => ({ ...previous, ...draft }))
    toast.success(
      'Datos de la conversación preparados. Revise antes de guardar.'
    )
  }
  const upload = async (files) => {
    setUploading(true)
    try {
      const urls = []
      for (const file of files) {
        const prepared = await prepareFile(file)
        const path = await uploadCompressedImage(
          prepared,
          `whatsapp/${businessId}`
        )
        const url = getImageUrl(path)
        if (!/^https:\/\//i.test(url))
          throw new Error('La imagen necesita una URL HTTPS.')
        urls.push(url)
      }
      if (active.current)
        setForm((previous) => ({
          ...previous,
          reference_images: [...(previous.reference_images || []), ...urls],
        }))
    } catch (error) {
      if (active.current)
        toast.error('No se pudo subir la foto: ' + error.message)
    } finally {
      if (active.current) setUploading(false)
    }
  }
  const submit = async (event) => {
    event.preventDefault()
    let payload
    try {
      buildOrderLines(form)
      setLineErrors([])
      payload = buildThreadPayload(form)
    } catch (error) {
      if (error.errors) setLineErrors(error.errors)
      else toast.error(error.message)
      return
    }
    setSaving(true)
    try {
      await onSave(payload)
    } finally {
      if (active.current) setSaving(false)
    }
  }
  const keyDown = (event) => {
    if (event.key === 'Escape' && !saving && !uploading) onClose()
    if (event.key !== 'Tab') return
    const elements = [
      ...dialog.current.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'
      ),
    ].filter((el) => el.offsetParent !== null)
    const first = elements[0],
      last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  return (
    <div
      className='fixed inset-0 z-50 flex justify-end bg-black/50'
      onKeyDown={keyDown}
    >
      <section
        ref={dialog}
        role='dialog'
        aria-modal='true'
        aria-labelledby='thread-editor-title'
        className='h-[100dvh] w-full max-w-xl overflow-y-auto bg-white p-4 text-gray-800 shadow-xl sm:p-6'
      >
        <div className='mb-4 flex items-center justify-between gap-3'>
          <h2 id='thread-editor-title' className='text-xl font-bold'>
            {thread ? 'Editar conversación' : 'Agregar manual'}
          </h2>
          <button
            ref={closeButton}
            type='button'
            className={button}
            disabled={saving || uploading}
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
        <form noValidate onSubmit={submit} className='min-w-0 space-y-4'>
          {!thread && (
            <details
              className='rounded-xl border border-gray-200 p-3'
              open={undefined}
            >
              <summary className='min-h-10 cursor-pointer text-sm font-semibold'>
                Pegar conversación (opcional)
              </summary>
              <p className='my-2 text-xs text-gray-500'>
                Pegue mensajes copiados de WhatsApp Web. Toque los nombres de
                quienes responden por el negocio. Los datos se preparan sin IA.
              </p>
              <textarea
                aria-label='Conversación copiada de WhatsApp'
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={6}
                className={inputClass}
                placeholder='[21:30, 19/11/2026] +505 8288 8070: Buenas…'
              />
              <p className='mt-2 text-xs font-semibold'>Nosotros:</p>
              <div className='my-2 flex flex-wrap gap-2'>
                {[...new Set([...ourSenders, ...parsed.senders])].map(
                  (sender) => (
                    <button
                      key={sender}
                      type='button'
                      aria-pressed={ourSenders.includes(sender)}
                      onClick={() => toggleSender(sender)}
                      className={`${button} ${ourSenders.includes(sender) ? 'bg-gray-100 ring-2 ring-[var(--color-primary,#51c879)]' : ''}`}
                    >
                      {sender}
                    </button>
                  )
                )}
              </div>
              {parsed.messages.length > 0 && (
                <p className='mb-2 text-xs text-gray-500'>
                  {parsed.messages.length} mensajes ·{' '}
                  {parsed.customer_name ||
                    parsed.customer_phone ||
                    'Sin cliente identificado'}
                  {parsed.promised_date
                    ? ` · Promesa detectada: ${parsed.promised_date}`
                    : ''}
                </p>
              )}
              <button
                type='button'
                className={button}
                onClick={applyChat}
                disabled={!parsed.messages.length}
              >
                Usar conversación
              </button>
            </details>
          )}
          <div className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2'>
            {TEXT_FIELDS.map(([key, label]) => (
              <label key={key} className='min-w-0 text-sm font-medium'>
                {label}
                <input
                  value={form[key] || ''}
                  onChange={(e) => update(key, e.target.value)}
                  className={inputClass}
                  type={key === 'customer_phone' ? 'tel' : 'text'}
                />
              </label>
            ))}
            <label className='min-w-0 text-sm font-medium'>
              Cliente vinculado
              <select
                value={form.client_id || ''}
                onChange={(e) => update('client_id', e.target.value)}
                className={inputClass}
              >
                <option value=''>Sin vincular</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className='text-sm font-medium'>
              Tipo
              <select
                value={form.kind}
                onChange={(e) => update('kind', e.target.value)}
                className={inputClass}
              >
                {Object.entries(KIND_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className='text-sm font-medium'>
              Estado
              <select
                value={form.status}
                onChange={(e) => update('status', e.target.value)}
                className={inputClass}
              >
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className='text-sm font-medium'>
              Monto cotizado (C$)
              <input
                type='number'
                min='0'
                step='0.01'
                value={form.quoted_amount}
                onChange={(e) => update('quoted_amount', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className='min-w-0 text-sm font-medium'>
              Pagado C$
              <input
                type='number'
                min='0'
                step='0.01'
                value={form.paid_amount}
                onChange={(e) => update('paid_amount', e.target.value)}
                className={inputClass}
              />
            </label>
            {DATE_FIELDS.map(([key, label]) => (
              <label key={key} className='min-w-0 text-sm font-medium'>
                {label}
                <input
                  type='date'
                  value={form[key] || ''}
                  onChange={(e) => update(key, e.target.value)}
                  className={inputClass}
                />
              </label>
            ))}
            <label className='text-sm font-medium'>
              Mensajes sin leer
              <input
                type='number'
                min='0'
                step='1'
                value={form.unread_count}
                onChange={(e) => update('unread_count', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className='text-sm font-medium'>
              Origen
              <select
                value={form.source}
                onChange={(e) => update('source', e.target.value)}
                className={inputClass}
              >
                <option value='manual'>Manual</option>
                <option value='claude'>Claude</option>
              </select>
            </label>
          </div>
          <label className='flex min-h-10 items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={form.awaiting_reply}
              onChange={(e) => update('awaiting_reply', e.target.checked)}
              className='h-5 w-5'
            />
            Cliente esperando nuestra respuesta
          </label>
          <label className='block text-sm font-medium'>
            Resumen
            <textarea
              required
              value={form.summary}
              onChange={(e) => update('summary', e.target.value)}
              rows={4}
              className={inputClass}
            />
          </label>
          <details open={lineErrors.length ? true : undefined} className='min-w-0 rounded-xl border border-gray-200 p-3'>
            <summary className='min-h-10 cursor-pointer text-sm font-semibold'>
              Detalle del pedido
            </summary>
            <div className='mt-2 space-y-3'>
              {form.order_lines.map((line, index) => (
                <fieldset key={index} className='min-w-0 rounded-lg border border-gray-200 p-3'>
                  <legend className='px-1 text-xs font-semibold'>Línea {index + 1}</legend>
                  <div className='grid min-w-0 grid-cols-2 gap-2'>
                    {[
                      ['name', 'Nombre', 'text'],
                      ['quantity', 'Cantidad', 'number'],
                      ['unit_price', 'Precio c/u (C$)', 'number'],
                      ['detail', 'Detalle (grabado, diseño o personalización)', 'text'],
                    ].map(([field, label, type]) => {
                      const error = lineErrors[index]?.[field]
                      const errorId = `thread-line-${index}-${field}-error`
                      return (
                        <label key={field} className={`min-w-0 text-sm ${field === 'name' || field === 'detail' ? 'col-span-2' : ''}`}>
                          {label}
                          <input
                            type={type}
                            inputMode={type === 'number' ? field === 'quantity' ? 'numeric' : 'decimal' : undefined}
                            min={field === 'quantity' ? '1' : field === 'unit_price' ? '0' : undefined}
                            step={field === 'quantity' ? '1' : 'any'}
                            value={line[field] ?? ''}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                            className={inputClass}
                            onChange={event => update('order_lines', form.order_lines.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: event.target.value } : row))}
                          />
                          {error && <span id={errorId} role='alert' className='mt-1 block text-xs text-red-700'>{error}</span>}
                        </label>
                      )
                    })}
                  </div>
                  <button type='button' className={`${button} mt-2`} onClick={() => { update('order_lines', form.order_lines.filter((_, rowIndex) => rowIndex !== index)); setLineErrors([]) }}>
                    Quitar línea
                  </button>
                </fieldset>
              ))}
              <button type='button' className={button} onClick={() => update('order_lines', [...form.order_lines, { name: '', quantity: 1, unit_price: '', detail: '' }])}>
                Agregar línea
              </button>
              {[
                ['delivery_address', 'Dirección de entrega'],
                ['recipient_name', 'Quién recibe'],
                ['recipient_phone', 'Teléfono de quien recibe'],
              ].map(([field, label]) => (
                <label key={field} className='block min-w-0 text-sm'>
                  {label}
                  <input type={field === 'recipient_phone' ? 'tel' : 'text'} className={inputClass} value={form[field] || ''} onChange={event => update(field, event.target.value)} />
                </label>
              ))}
            </div>
          </details>
          <label className='block text-sm font-medium'>
            Notas privadas
            <textarea
              value={form.notes || ''}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              className={inputClass}
            />
          </label>
          <label className='block text-sm font-medium'>
            Etiquetas de WhatsApp (una por línea)
            <textarea
              value={form.labels.join('\n')}
              onChange={(e) => update('labels', e.target.value.split('\n'))}
              onBlur={() =>
                update(
                  'labels',
                  form.labels.map((label) => label.trim()).filter(Boolean)
                )
              }
              rows={3}
              className={inputClass}
            />
          </label>
          <details className='rounded-xl border border-gray-200 p-3'>
            <summary className='min-h-10 cursor-pointer text-sm font-semibold'>
              Fechas de mensajes y revisión
            </summary>
            <p className='text-xs text-gray-500'>
              Use ISO 8601 con zona horaria, por ejemplo
              2026-11-19T21:30:00-06:00.
            </p>
            {TIME_FIELDS.map(([key, label]) => (
              <label key={key} className='mt-2 block text-sm'>
                {label}
                <input
                  value={form[key] || ''}
                  onChange={(e) => update(key, e.target.value)}
                  className={inputClass}
                  placeholder='2026-11-19T21:30:00-06:00'
                />
              </label>
            ))}
          </details>
          <fieldset className='min-w-0'>
            <legend className='text-sm font-semibold'>
              Fotos de referencia
            </legend>
            <p className='mt-1 text-xs text-gray-500'>
              Las fotos se comprimen con el servicio existente (WebP cuando está
              disponible).
            </p>
            <div className='my-2 flex flex-wrap gap-2'>
              {form.reference_images.map((url, i) => (
                <div key={`${url}:${i}`} className='w-20'>
                  <img
                    src={url}
                    alt={`Referencia ${i + 1}`}
                    className='h-20 w-20 rounded-lg object-cover'
                  />
                  <button
                    type='button'
                    disabled={uploading}
                    className={`${button} mt-1 w-full px-1 text-xs`}
                    onClick={() =>
                      update(
                        'reference_images',
                        form.reference_images.filter((_, index) => index !== i)
                      )
                    }
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <label
              className={`${button} inline-flex cursor-pointer items-center`}
            >
              {uploading ? 'Subiendo…' : 'Agregar fotos'}
              <input
                className='sr-only'
                disabled={saving || uploading}
                type='file'
                accept='image/*,.heic,.heif'
                multiple
                onChange={(e) => {
                  upload(Array.from(e.target.files))
                  e.target.value = ''
                }}
              />
            </label>
            <label className='mt-3 block text-sm'>
              Enlaces HTTPS (uno por línea)
              <textarea
                className={inputClass}
                value={form.reference_images.join('\n')}
                onChange={(e) =>
                  update('reference_images', e.target.value.split('\n'))
                }
                onBlur={() =>
                  update(
                    'reference_images',
                    form.reference_images
                      .map((url) => url.trim())
                      .filter(Boolean)
                  )
                }
                rows={3}
              />
            </label>
          </fieldset>
          <div className='flex flex-wrap gap-2 border-t border-gray-200 pt-4'>
            <button
              type='submit'
              disabled={saving || uploading}
              className={`${button} bg-gray-100`}
            >
              {saving ? 'Guardando…' : 'Guardar conversación'}
            </button>
            <button
              type='button'
              disabled={saving || uploading}
              className={button}
              onClick={onClose}
            >
              Cancelar
            </button>
            {thread && (
              <button
                type='button'
                disabled={saving || uploading}
                className={button}
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar
              </button>
            )}
          </div>
          {confirmDelete && (
            <div
              role='alert'
              className='rounded-xl border border-gray-200 p-3 text-sm'
            >
              <p>Se eliminará esta conversación del panel, no de WhatsApp.</p>
              <button
                type='button'
                disabled={saving}
                className={`${button} mt-2`}
                onClick={async () => {
                  setSaving(true)
                  try {
                    await onDelete(thread)
                  } finally {
                    if (active.current) setSaving(false)
                  }
                }}
              >
                Confirmar eliminación
              </button>
              <button
                type='button'
                className={`${button} ml-2`}
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  )
}
