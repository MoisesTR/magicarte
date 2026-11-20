import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import AdminLogin from '../components/AdminLogin'
import { useBusiness } from '../context/BusinessContext'
import useWhatsAppFeed from '../hooks/useWhatsAppFeed'
import {
  groupThreads,
  hoursAgo,
  loadFeedTab,
  saveFeedTab,
  feedTabKey,
  visibleFeedThreads,
  filterThreadsByDate,
  loadFeedDateRange,
  saveFeedDateRange,
} from '../utils/whatsappFeed'
import {
  createWhatsAppThread,
  updateWhatsAppThread,
  deleteWhatsAppThread,
  markWhatsAppThread,
  markNotCustomer,
  registerWhatsAppPayment,
} from '../data/whatsappThreads'
import ThreadCard from '../components/whatsapp/ThreadCard'
import ThreadEditor from '../components/whatsapp/ThreadEditor'

const TAB_LABELS = {
  confirmed: 'Confirmados',
  today: 'Responder hoy',
  unanswered: 'Sin responder',
  toQuote: 'Por cotizar',
  payments: 'Pagos',
  waiting: 'Esperando cliente',
  inOrders: 'En Pedidos ✓',
  closed: 'Descartados',
}

function FeedContent({ businessId, threads, now, ...props }) {
  const [dateRange, setDateRange] = useState(() =>
    loadFeedDateRange(businessId)
  )
  const filteredThreads = filterThreadsByDate(threads, dateRange, now)
  const groups = groupThreads(filteredThreads, now)
  const selectRange = (range) => {
    setDateRange(range)
    saveFeedDateRange(businessId, range)
  }
  return (
    <>
      <div
        role='group'
        aria-label='Filtrar por fecha'
        className='grid w-full min-w-0 grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-white p-1'
      >
        {[
          ['today', 'Hoy'],
          ['week', 'Esta semana'],
          ['all', 'Todo'],
        ].map(([range, label]) => (
          <button
            key={range}
            type='button'
            aria-pressed={dateRange === range}
            onClick={() => selectRange(range)}
            className={`min-h-10 min-w-0 rounded-lg border px-2 py-2 text-sm font-semibold text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] ${dateRange === range ? 'border-[var(--color-primary)] bg-gray-100' : 'border-transparent hover:bg-gray-100'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {filteredThreads.length < threads.length && (
        <p role='status' className='text-xs text-gray-500'>
          Mostrando {filteredThreads.length} de {threads.length} conversaciones
        </p>
      )}
      <FeedGroups
        key={dateRange}
        businessId={businessId}
        groups={groups}
        now={now}
        {...props}
      />
    </>
  )
}

function FeedGroups({
  groups,
  businessId,
  ordersPath,
  now,
  busy,
  onEdit,
  onStatus,
  onNotCustomer,
  onPayment,
  orderMatches,
  autoLinkedThreadIds = [],
}) {
  const [selectedTab, setSelectedTab] = useState(() =>
    loadFeedTab(businessId, groups)
  )
  const [openThread, setOpenThread] = useState(null)
  const [showAllWaiting, setShowAllWaiting] = useState(false)
  const [chromeHeight, setChromeHeight] = useState(0)

  useEffect(() => {
    const chrome = document.querySelector('[data-admin-chrome]')
    if (!chrome) return
    const measure = () => setChromeHeight(chrome.getBoundingClientRect().height)
    measure()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(chrome)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const selectTab = (key) => {
    setSelectedTab(key)
    setOpenThread(null)
    setShowAllWaiting(false)
    saveFeedTab(businessId, key)
  }
  const selectedGroup =
    groups.find((group) => group.key === selectedTab) || groups[0]
  const threads = visibleFeedThreads(selectedGroup, showAllWaiting)
  const remaining = selectedGroup.threads.length - threads.length

  return (
    <>
      <div
        role='tablist'
        aria-label='Conversaciones de WhatsApp'
        aria-orientation='horizontal'
        className='sticky z-30 flex w-full max-w-full min-w-0 gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-gray-200 bg-white p-1 shadow-sm'
        style={{ top: chromeHeight }}
      >
        {groups.map((group) => {
          const selected = selectedTab === group.key
          return (
            <button
              key={group.key}
              type='button'
              role='tab'
              id={`whatsapp-tab-${group.key}`}
              aria-selected={selected}
              aria-controls='whatsapp-feed-panel'
              tabIndex={selected ? 0 : -1}
              title={group.title}
              className={`min-h-11 shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold whitespace-nowrap text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] ${selected ? 'border-[var(--color-primary)] bg-gray-100' : 'border-transparent hover:bg-gray-100'} ${group.threads.length ? '' : 'opacity-50'}`}
              onClick={() => selectTab(group.key)}
              onKeyDown={(event) => {
                const key = feedTabKey(groups, group.key, event.key)
                if (!key) return
                event.preventDefault()
                selectTab(key)
                const tab = document.getElementById(`whatsapp-tab-${key}`)
                tab?.focus({ preventScroll: true })
                tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }}
            >
              {TAB_LABELS[group.key]}{' '}
              <span className='ml-1 text-gray-500 tabular-nums'>
                {group.count ?? group.threads.length}
              </span>
            </button>
          )
        })}
      </div>
      <section
        id='whatsapp-feed-panel'
        role='tabpanel'
        aria-labelledby={`whatsapp-tab-${selectedTab}`}
        tabIndex={0}
        className='min-w-0 space-y-2 rounded-xl focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]'
      >
        <h2 className='sr-only'>{selectedGroup.title}</h2>
        {selectedTab === 'confirmed' && (
          <p className='px-1 text-sm text-gray-600'>
            Acordado en WhatsApp y aún sin pedido registrado
          </p>
        )}
        {(selectedTab === 'confirmed'
          ? selectedGroup.deliveryGroups.filter((group) => group.threads.length)
          : [{ key: selectedGroup.key, threads }]
        ).map((group) => (
          <div key={group.key} className='min-w-0 space-y-2'>
            {selectedTab === 'confirmed' && (
              <h3 className='px-1 pt-2 text-sm font-bold text-gray-700'>
                {group.title}
              </h3>
            )}
            {group.threads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                matchedOrder={orderMatches?.get(thread.id)}
                autoLinked={autoLinkedThreadIds.includes(thread.id)}
                now={now}
                expanded={openThread === thread.id}
                onToggle={() =>
                  setOpenThread(openThread === thread.id ? null : thread.id)
                }
                ordersPath={ordersPath}
                busy={busy}
                onEdit={onEdit}
                onStatus={onStatus}
                onNotCustomer={onNotCustomer}
                onPayment={onPayment}
              />
            ))}
          </div>
        ))}
        {!threads.length && (
          <p className='px-3 py-4 text-sm text-gray-500'>
            {selectedTab === 'confirmed'
              ? 'Nada confirmado sin registrar'
              : 'Sin conversaciones en este grupo.'}
          </p>
        )}
        {remaining > 0 && (
          <button
            type='button'
            onClick={() => setShowAllWaiting(true)}
            className='min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100'
          >
            Ver {remaining} más
          </button>
        )}
      </section>
    </>
  )
}

export default function WhatsAppFeed() {
  const { currentBusinessId, currentBusiness } = useBusiness()
  const query = useWhatsAppFeed(currentBusinessId)
  const [editor, setEditor] = useState(null),
    [busy, setBusy] = useState(false)
  if (!query.checkingAuth && !query.user)
    return <AdminLogin onLogin={query.onLogin} />
  if (query.loading)
    return (
      <main
        className='min-h-screen bg-gray-50 p-6 text-gray-500'
        aria-busy='true'
      >
        <p role='status'>Cargando WhatsApp…</p>
      </main>
    )
  const data = query.data
  const mutate = async (operation) => {
    setBusy(true)
    try {
      const result = await operation()
      if (result.error) throw result.error
      await query.refresh()
      return true
    } catch (error) {
      toast.error(
        error.code === '23505'
          ? 'Ya existe una conversación abierta para este chat. Edítela en lugar de duplicarla.'
          : error.message
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  const save = async (payload) => {
    if (
      await mutate(() =>
        editor?.thread
          ? updateWhatsAppThread(editor.thread.id, payload, currentBusinessId)
          : createWhatsAppThread(payload, currentBusinessId)
      )
    ) {
      setEditor(null)
      toast.success('Conversación guardada')
    }
  }
  const reviewHours = hoursAgo(data?.lastReview?.reviewed_at, query.now)
  return (
    <main className='min-h-screen min-w-0 bg-gray-50 px-3 py-3 text-gray-800 sm:px-4'>
      <div className='mx-auto w-full max-w-[880px] min-w-0 space-y-3'>
        <header className='admin-page-header min-w-0 rounded-xl bg-white px-4 py-3 shadow-sm'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h1 className='text-xl font-bold'>WhatsApp</h1>
            <div className='flex flex-wrap gap-2'>
              <button
                className='min-h-11 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold disabled:opacity-50'
                disabled={query.isFetching}
                onClick={query.refresh}
              >
                {query.isFetching ? 'Actualizando…' : '↻ Actualizar'}
              </button>
              <button
                disabled={!data?.available}
                onClick={() => setEditor({ thread: null })}
                className='min-h-11 rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-semibold disabled:opacity-50'
              >
                Agregar manual
              </button>
            </div>
          </div>
          <p className='mt-1 text-xs text-gray-500'>
            Última revisión de Claude:{' '}
            {reviewHours == null
              ? 'sin revisión registrada'
              : `hace ${reviewHours} h (${data.lastReview.chats_seen ?? 0} chats)`}
          </p>
        </header>
        {query.isError && (
          <div
            role='alert'
            className='rounded-xl border border-gray-200 bg-white p-3 text-sm'
          >
            No se pudo actualizar WhatsApp. Revise su conexión e intente de
            nuevo.
            {data && ' Se muestran datos de la última carga.'}
            <button
              onClick={query.refresh}
              className='ml-2 min-h-11 px-3 font-semibold'
            >
              Reintentar
            </button>
          </div>
        )}
        {data?.notice && (
          <p
            role='status'
            className='rounded-xl border border-gray-200 bg-white p-3 text-sm'
          >
            {data.notice}. La migración debe aplicarse por separado.
          </p>
        )}
        {data?.available && (
          <FeedContent
            key={currentBusinessId}
            businessId={currentBusinessId}
            threads={data.threads || []}
            orderMatches={data.orderMatches}
            autoLinkedThreadIds={data.autoLinkedThreadIds}
            now={query.now}
            ordersPath={`/admin/${currentBusiness.slug}/orders`}
            busy={busy}
            onPayment={(thread, amount) =>
              mutate(() =>
                registerWhatsAppPayment(thread.id, amount, currentBusinessId)
              )
            }
            onEdit={(thread) => setEditor({ thread })}
            onNotCustomer={(thread, reason) =>
              mutate(() => markNotCustomer(thread, reason, currentBusinessId))
            }
            onStatus={(thread, status, reason) =>
              mutate(() =>
                markWhatsAppThread(thread.id, status, currentBusinessId, reason)
              )
            }
          />
        )}
      </div>
      {editor && (
        <ThreadEditor
          thread={editor.thread}
          businessId={currentBusinessId}
          onClose={() => setEditor(null)}
          onSave={save}
          onDelete={async (thread) => {
            if (
              await mutate(() =>
                deleteWhatsAppThread(thread.id, currentBusinessId)
              )
            )
              setEditor(null)
          }}
        />
      )}
    </main>
  )
}
