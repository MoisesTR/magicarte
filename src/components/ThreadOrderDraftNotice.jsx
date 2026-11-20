/** Passive inline feedback: neither AI availability nor completion blocks saving. */
export default function ThreadOrderDraftNotice({ draft }) {
  if (draft.status === 'idle') return null
  return (
    <div role='status' aria-live='polite' className='min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700'>
      {draft.status === 'loading' && <p>Completando con IA…</p>}
      {draft.status === 'completed' && <p>Pedido completado con IA — revise antes de guardar</p>}
      {draft.status === 'error' && <p>{draft.error}</p>}
      <button type='button' onClick={draft.restoreOriginal} className='mt-2 min-h-10 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100'>Usar versión original</button>
    </div>
  )
}
