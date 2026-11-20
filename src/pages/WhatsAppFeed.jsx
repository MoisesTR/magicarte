import { useState } from 'react'
import toast from 'react-hot-toast'
import AdminLogin from '../components/AdminLogin'
import { useBusiness } from '../context/BusinessContext'
import useWhatsAppFeed from '../hooks/useWhatsAppFeed'
import { groupThreads, feedKPIs, hoursAgo } from '../utils/whatsappFeed'
import {
  createWhatsAppThread,
  updateWhatsAppThread,
  deleteWhatsAppThread,
  markWhatsAppThread,
} from '../data/whatsappThreads'
import ThreadCard from '../components/whatsapp/ThreadCard'
import ThreadEditor from '../components/whatsapp/ThreadEditor'

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
  const groups = groupThreads(data?.threads || [], query.now),
    kpis = feedKPIs(data?.threads || [], query.now)
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
    <main className='min-h-screen min-w-0 bg-gray-50 px-3 py-5 text-gray-800 sm:px-4'>
      <div className='mx-auto max-w-7xl space-y-4'>
        <header className='admin-page-header shadow-soft min-w-0 rounded-2xl bg-white p-4 sm:p-5'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <h1 className='text-2xl font-bold'>WhatsApp</h1>
              <p className='mt-1 text-sm text-gray-500'>
                {currentBusiness?.name}
              </p>
              <p className='mt-2 text-xs text-gray-500'>
                Última revisión de Claude:{' '}
                {reviewHours == null
                  ? 'sin revisión registrada'
                  : `hace ${reviewHours} h (${data.lastReview.chats_seen ?? 0} chats)`}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <button
                className='min-h-10 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold disabled:opacity-50'
                disabled={query.isFetching}
                onClick={query.refresh}
              >
                {query.isFetching ? 'Actualizando…' : '↻ Actualizar'}
              </button>
              <button
                disabled={!data?.available}
                onClick={() => setEditor({ thread: null })}
                className='min-h-10 rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-semibold disabled:opacity-50'
              >
                Agregar manual
              </button>
            </div>
          </div>
          <div className='mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {[
              ['today', 'Para hoy'],
              ['unanswered', 'Sin responder'],
              ['toQuote', 'Por cotizar'],
              ['payments', 'Pagos pendientes'],
            ].map(([key, label]) => (
              <button
                key={key}
                className='min-h-10 min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left text-sm'
                onClick={() =>
                  document
                    .getElementById(`whatsapp-${key}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                <span className='block text-xs text-gray-500'>{label}</span>
                <strong className='mt-1 block text-xl'>{kpis[key]}</strong>
              </button>
            ))}
          </div>
        </header>
        {query.isError && (
          <div
            role='alert'
            className='rounded-xl border border-gray-200 bg-white p-4 text-sm'
          >
            No se pudo actualizar WhatsApp. Revise su conexión e intente de
            nuevo.{data && ' Se muestran datos de la última carga.'}
            <button
              onClick={query.refresh}
              className='ml-2 min-h-10 px-3 font-semibold'
            >
              Reintentar
            </button>
          </div>
        )}
        {data?.notice && (
          <p
            role='status'
            className='rounded-xl border border-gray-200 bg-white p-4 text-sm'
          >
            {data.notice}. La migración debe aplicarse por separado.
          </p>
        )}
        {data?.available && (
          <>
            {!groups.some((group) => group.threads.length) && (
              <div className='shadow-soft rounded-2xl bg-white p-8 text-center'>
                <h2 className='text-lg font-bold'>Todo al día en WhatsApp</h2>
                <p className='mt-2 text-sm text-gray-500'>
                  Aquí aparecerán las conversaciones que necesitan atención.
                </p>
              </div>
            )}
            <div className='grid min-w-0 items-start gap-4 md:grid-cols-2'>
              {groups.map((group) => {
                const content = (
                  <>
                    <h2 className='mb-3 text-base font-bold'>
                      {group.title}{' '}
                      <span className='text-gray-500'>
                        ({group.threads.length})
                      </span>
                    </h2>
                    <div className='min-w-0 space-y-3'>
                      {group.threads.map((thread) => (
                        <ThreadCard
                          key={thread.id}
                          thread={thread}
                          ordersPath={`/admin/${currentBusiness.slug}/orders`}
                          busy={busy}
                          onEdit={(thread) => setEditor({ thread })}
                          onStatus={(thread, status, reason) =>
                            mutate(() =>
                              markWhatsAppThread(
                                thread.id,
                                status,
                                currentBusinessId,
                                reason
                              )
                            )
                          }
                        />
                      ))}
                      {!group.threads.length && (
                        <p className='rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500'>
                          Sin conversaciones pendientes.
                        </p>
                      )}
                    </div>
                  </>
                )
                return group.key === 'closed' ? (
                  <details
                    key={group.key}
                    id={`whatsapp-${group.key}`}
                    className='min-w-0 scroll-mt-36 rounded-xl border border-gray-200 p-3'
                  >
                    <summary className='min-h-10 cursor-pointer text-sm font-semibold'>
                      Cerrados (30 días) · {group.threads.length}
                    </summary>
                    <div className='mt-3'>{content}</div>
                  </details>
                ) : (
                  <section
                    key={group.key}
                    id={`whatsapp-${group.key}`}
                    className='min-w-0 scroll-mt-36'
                  >
                    {content}
                  </section>
                )
              })}
            </div>
          </>
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
