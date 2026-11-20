import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  KIND_LABELS,
  STATUS_LABELS,
  OPEN_STATUSES,
  chatPhone,
} from '../../utils/whatsappFeed'

const button =
  'min-h-10 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50'
const dateLabel = (date) =>
  date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : ''

export default function ThreadCard({
  thread,
  ordersPath,
  onEdit,
  onStatus,
  busy,
}) {
  const [expanded, setExpanded] = useState(false),
    [lost, setLost] = useState(false),
    [reason, setReason] = useState('')
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
    <article className='min-w-0 rounded-2xl border border-gray-200 bg-white p-4 [overflow-wrap:anywhere] shadow-sm'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <h3 className='font-bold text-gray-800'>
            {thread.customer_name ||
              thread.customer_phone ||
              thread.chat_key.replace(/^name:/, '')}
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
      <p
        className={`mt-3 text-sm whitespace-pre-wrap text-gray-800 ${expanded ? '' : 'line-clamp-3'}`}
      >
        {thread.summary}
      </p>
      <button
        className='mt-1 min-h-10 text-xs font-semibold text-gray-500'
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Ver menos' : 'Ver conversación completa'}
      </button>
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
    </article>
  )
}
