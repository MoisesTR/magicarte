import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  KIND_LABELS,
  STATUS_LABELS,
  OPEN_STATUSES,
  chatPhone,
  rowChip,
  aiTagChip,
  isConfirmedThread,
  isNotCustomer,
  deliveryDateLabel,
} from '../../utils/whatsappFeed'

const button =
  'min-h-10 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50'
const dateLabel = (date) =>
  date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : ''

function ThreadDetail({
  thread,
  ordersPath,
  onEdit,
  onStatus,
  onNotCustomer,
  onPayment,
  onClassify,
  classification,
  now,
  busy,
}) {
  const [lost, setLost] = useState(false),
    [reason, setReason] = useState(''),
    [notCustomer, setNotCustomer] = useState(false),
    [nonCustomerReason, setNonCustomerReason] = useState(''),
    [marking, setMarking] = useState(false),
    [payment, setPayment] = useState(''),
    [paying, setPaying] = useState(false)
  const confirmationId = useId()
  const tag = aiTagChip(thread, now)
  const phone = chatPhone(thread)
  const open = OPEN_STATUSES.includes(thread.status)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phone)
      toast.success('Número copiado')
    } catch {
      toast.error('No se pudo copiar el número. Cópielo desde la tarjeta.')
    }
  }
  return (
    <div className='min-w-0 border-t border-gray-200 p-4 [overflow-wrap:anywhere]'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <h3 className='font-bold text-gray-800'>
            {thread.customer_name ||
              thread.customer_phone ||
              thread.chat_key?.replace(/^name:/, '')}
          </h3>
          {phone && <p className='mt-1 text-sm text-gray-500'>+{phone}</p>}
        </div>
        {thread.source === 'claude' && (
          <span className='rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600'>
            Claude
          </span>
        )}
      </div>
      <div className='mt-2 flex flex-wrap gap-1.5 text-xs text-gray-700'>
        {tag && <AITag chip={tag} />}
        <span className='rounded-full bg-gray-100 px-2 py-1'>
          {KIND_LABELS[thread.kind]}
        </span>
        <span className='rounded-full border border-gray-200 px-2 py-1'>
          {STATUS_LABELS[thread.status]}
        </span>
        {(thread.labels || []).map((label) => (
          <span
            key={label}
            className='rounded-md border border-gray-200 px-2 py-1 text-gray-500'
          >
            {label}
          </span>
        ))}
        {thread.unread_count > 0 && (
          <span className='rounded-md bg-gray-100 px-2 py-1'>
            {thread.unread_count} sin leer
          </span>
        )}
      </div>
      {tag && thread.ai_tag_reason && (
        <p className='mt-2 text-xs text-gray-500'>{thread.ai_tag_reason}</p>
      )}
      <p className='mt-3 text-sm whitespace-pre-wrap text-gray-800'>
        {thread.summary}
      </p>
      {thread.next_action && (
        <p className='mt-1 rounded-xl border-l-4 border-[var(--color-primary,#51c879)] bg-gray-50 p-3 text-sm font-semibold text-gray-800'>
          {thread.next_action}
        </p>
      )}
      {thread.promised_date && (
        <p className='mt-3 text-xs font-medium text-gray-600'>
          Prometido {dateLabel(thread.promised_date)}
          {thread.promise_source && <> · «{thread.promise_source}»</>}
        </p>
      )}
      {thread.follow_up_date && (
        <p className='mt-2 text-xs text-gray-500'>
          Seguimiento {dateLabel(thread.follow_up_date)}
        </p>
      )}
      {thread.timeHint && (
        <p className='mt-2 text-sm font-semibold text-gray-700'>
          {thread.timeHint}
        </p>
      )}
      {thread.quoted_amount != null && (
        <p className='mt-3 font-bold text-gray-800'>
          C${' '}
          {Number(thread.quoted_amount).toLocaleString('es-NI', {
            minimumFractionDigits: 2,
          })}
        </p>
      )}
      {!!thread.reference_images?.length && (
        <div className='mt-3 flex flex-wrap gap-2'>
          {thread.reference_images
            .filter((url) => /^https:\/\//i.test(url))
            .map((url, i) => (
              <a
                key={`${url}:${i}`}
                href={url}
                target='_blank'
                rel='noopener noreferrer'
                aria-label={`Abrir referencia ${i + 1}`}
              >
                <img
                  loading='lazy'
                  src={url}
                  alt={`Referencia ${i + 1}`}
                  className='h-16 w-16 rounded-lg border border-gray-200 object-cover'
                />
              </a>
            ))}
        </div>
      )}
      {thread.lost_reason && (
        <p className='mt-3 text-xs text-gray-500'>
          Motivo: {thread.lost_reason}
        </p>
      )}
      <div className='mt-3 flex flex-wrap gap-2'>
        {thread.ai_tag == null && (
          <button
            type='button'
            className={button}
            disabled={busy || classification?.pending}
            onClick={() => onClassify?.(thread)}
          >
            {classification?.pending ? 'Clasificando…' : 'Clasificar con AI'}
          </button>
        )}
        {phone && (
          <>
            <a
              className={button}
              href={`https://wa.me/${phone}`}
              target='_blank'
              rel='noopener noreferrer'
            >
              Abrir chat
            </a>
            <button className={button} onClick={copy}>
              Copiar número
            </button>
          </>
        )}
        <button className={button} onClick={() => onEdit(thread)}>
          Editar
        </button>
        {thread.order_id && (
          <Link
            className={button}
            to={`${ordersPath}?order=${thread.order_id}`}
          >
            Ver pedido
          </Link>
        )}
        {open && (
          <>
            {thread.status !== 'sent' && (
              <button
                disabled={busy}
                className={button}
                onClick={() => onStatus(thread, 'sent')}
              >
                Cotización enviada
              </button>
            )}
            {thread.status !== 'follow_up' && (
              <button
                disabled={busy}
                className={button}
                onClick={() => onStatus(thread, 'follow_up')}
              >
                Dar seguimiento
              </button>
            )}
            <button
              disabled={busy}
              className={button}
              onClick={() => onStatus(thread, 'won')}
            >
              Marcar ganada
            </button>
            <button
              disabled={busy}
              className={button}
              onClick={() => {
                setNotCustomer(false)
                setLost(!lost)
              }}
            >
              Marcar perdida
            </button>
            <button
              disabled={busy}
              className={button}
              onClick={() => onStatus(thread, 'done')}
            >
              Cerrar
            </button>
            <button
              disabled={busy || marking}
              className={button}
              aria-expanded={notCustomer}
              aria-controls={confirmationId}
              onClick={() => {
                setLost(false)
                setNotCustomer(!notCustomer)
              }}
            >
              No es cliente
            </button>
            {!thread.order_id && (
              <Link
                className={`${button} border-[var(--color-primary,#51c879)]`}
                to={`${ordersPath}?fromThread=${thread.id}`}
              >
                Convertir en pedido
              </Link>
            )}
          </>
        )}
      </div>
      {classification?.error && (
        <p role='alert' className='mt-2 text-xs text-red-700'>
          {classification.error}
        </p>
      )}
      {open && notCustomer && (
        <form
          id={confirmationId}
          className='mt-3 space-y-2 rounded-lg bg-gray-50 p-3'
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy || marking || !onNotCustomer) return
            setMarking(true)
            try {
              if (await onNotCustomer(thread, nonCustomerReason)) {
                setNotCustomer(false)
                setNonCustomerReason('')
              }
            } finally {
              setMarking(false)
            }
          }}
        >
          <p className='text-sm font-semibold text-gray-700'>
            ¿Marcar como no cliente y cerrar la conversación?
          </p>
          <label className='block text-sm text-gray-700'>
            Motivo (opcional)
            <input
              value={nonCustomerReason}
              onChange={(event) => setNonCustomerReason(event.target.value)}
              maxLength={80}
              placeholder='Ej.: delivery, proveedor'
              className='mt-1 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-gray-800'
            />
          </label>
          <button type='submit' disabled={busy || marking} className={button}>
            Confirmar
          </button>
          <button
            type='button'
            disabled={busy || marking}
            className={`${button} ml-2`}
            onClick={() => {
              setNotCustomer(false)
              setNonCustomerReason('')
            }}
          >
            Cancelar
          </button>
        </form>
      )}
      {open && (
        <form
          className='mt-3 flex min-w-0 flex-wrap items-end gap-2'
          onSubmit={async (event) => {
            event.preventDefault()
            if (paying || busy || !onPayment) return
            setPaying(true)
            try {
              if (await onPayment(thread, payment)) setPayment('')
            } finally {
              setPaying(false)
            }
          }}
        >
          <label className='min-w-0 flex-1 text-xs font-medium text-gray-700'>
            Monto del pago (C$)
            <input
              required
              type='number'
              inputMode='decimal'
              min='0.01'
              step='0.01'
              value={payment}
              onChange={(event) => setPayment(event.target.value)}
              className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800'
            />
          </label>
          <button type='submit' disabled={busy || paying} className={button}>
            Registrar pago
          </button>
        </form>
      )}
      {lost && (
        <div className='mt-3 space-y-2 rounded-lg bg-gray-50 p-3'>
          <label className='block text-sm text-gray-700'>
            Motivo (opcional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className='mt-1 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3'
            />
          </label>
          <button
            disabled={busy}
            onClick={() => onStatus(thread, 'lost', reason)}
            className={button}
          >
            Confirmar pérdida
          </button>
          <button className={`${button} ml-2`} onClick={() => setLost(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

const ROW_TONES = {
  danger: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700' },
  warning: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700' },
  success: { dot: 'bg-green-500', chip: 'bg-green-50 text-green-700' },
  neutral: { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600' },
}

function AITag({ chip }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium [overflow-wrap:anywhere] ${ROW_TONES[chip.tone].chip}`}
    >
      {chip.text}
      <span className='shrink-0 rounded border border-current px-1 text-[9px] leading-4'>
        AI
      </span>
    </span>
  )
}

export default function ThreadCard({
  thread,
  now,
  expanded,
  onToggle,
  matchedOrder,
  autoLinked = false,
  ...detailProps
}) {
  const id = useId()
  const confirmed = isConfirmedThread(thread)
  const notCustomer = isNotCustomer(thread)
  const tag = aiTagChip(thread, now)
  const chip = rowChip(thread, now)
  const tone = ROW_TONES[chip.tone]
  const name =
    thread.customer_name ||
    thread.customer_phone ||
    thread.chat_key?.replace(/^name:/, '') ||
    'Cliente'
  return (
    <article className='min-w-0 rounded-xl border border-gray-200 bg-white'>
      <button
        type='button'
        id={`${id}-toggle`}
        aria-expanded={expanded}
        aria-controls={`${id}-detail`}
        onClick={onToggle}
        className='block min-h-14 w-full min-w-0 rounded-xl px-3 py-2 text-left hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]'
      >
        <span
          className={`grid min-w-0 items-center gap-2 ${confirmed || notCustomer || tag ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto]'}`}
        >
          <span className='flex min-w-0 items-center gap-2'>
            <span
              aria-hidden='true'
              className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`}
            />
            <span className='max-w-[45%] truncate text-sm font-semibold text-gray-800'>
              {name}
            </span>
            <span className='min-w-0 flex-1 truncate text-sm text-gray-500'>
              {thread.summary}
            </span>
          </span>
          <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
            {tag && <AITag chip={tag} />}
            <span
              className={`${confirmed || notCustomer ? 'w-fit max-w-full [overflow-wrap:anywhere] whitespace-normal' : 'max-w-[10rem] truncate'} rounded-md px-2 py-1 text-xs font-medium tabular-nums ${tone.chip}`}
            >
              {chip.text}
            </span>
          </span>
        </span>
        {confirmed ? (
          <span className='mt-1 flex min-w-0 flex-wrap items-center gap-1.5 pl-4 text-xs [overflow-wrap:anywhere] text-gray-600'>
            <span className='font-semibold'>
              {deliveryDateLabel(thread.delivery_date, now)}
            </span>
            {thread.delivery_method && (
              <span className='min-w-0'>{thread.delivery_method}</span>
            )}
            {thread.customer_name && thread.customer_phone && (
              <span>{thread.customer_phone}</span>
            )}
            <span className='rounded-md bg-red-50 px-2 py-1 font-semibold text-red-700'>
              Sin pedido registrado
            </span>
          </span>
        ) : (
          <span className='mt-1 block truncate pl-4 text-xs text-gray-500'>
            → {thread.next_action || 'Sin próxima acción'}
          </span>
        )}
      </button>
      {confirmed && !thread.order_id && (
        <div className='flex min-w-0 flex-wrap items-center gap-2 px-3 pb-2 pl-7'>
          <Link
            to={`${detailProps.ordersPath}?fromThread=${encodeURIComponent(thread.id)}`}
            className='inline-flex min-h-10 max-w-full items-center rounded-md border border-[var(--color-primary,#51c879)] px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]'
          >
            Crear pedido
          </Link>
        </div>
      )}
      {thread.order_id && matchedOrder && (
        <div className='flex min-w-0 flex-wrap items-center gap-2 px-3 pb-2 pl-7'>
          <Link
            to={`${detailProps.ordersPath}?order=${encodeURIComponent(thread.order_id)}`}
            className='inline-flex min-h-10 max-w-full items-center rounded-md bg-green-50 px-2 py-1 text-xs font-semibold [overflow-wrap:anywhere] text-green-700 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]'
          >
            Pedido #{matchedOrder.order_number} ✓
          </Link>
          {autoLinked && (
            <span className='text-xs text-gray-500'>
              Vinculado por teléfono
            </span>
          )}
        </div>
      )}
      {expanded && (
        <div id={`${id}-detail`} role='region' aria-labelledby={`${id}-toggle`}>
          <ThreadDetail thread={thread} now={now} {...detailProps} />
        </div>
      )}
    </article>
  )
}
