import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  KIND_LABELS,
  STATUS_LABELS,
  OPEN_STATUSES,
  chatPhone,
  rowChip,
  isConfirmedThread,
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
  onPayment,
  busy,
}) {
  const [lost, setLost] = useState(false),
    [reason, setReason] = useState(''),
    [payment, setPayment] = useState(''),
    [paying, setPaying] = useState(false)
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
              onClick={() => setLost(!lost)}
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

export default function ThreadCard({
  thread,
  now,
  expanded,
  onToggle,
  ...detailProps
}) {
  const id = useId()
  const confirmed = isConfirmedThread(thread)
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
          className={`grid min-w-0 items-center gap-2 ${confirmed ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto]'}`}
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
          <span
            className={`${confirmed ? 'w-fit max-w-full whitespace-normal' : 'max-w-[10rem] truncate'} rounded-md px-2 py-1 text-xs font-medium tabular-nums ${tone.chip}`}
          >
            {chip.text}
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
      {expanded && (
        <div id={`${id}-detail`} role='region' aria-labelledby={`${id}-toggle`}>
          <ThreadDetail thread={thread} {...detailProps} />
        </div>
      )}
    </article>
  )
}
