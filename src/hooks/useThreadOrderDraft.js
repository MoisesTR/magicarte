import { useEffect, useRef, useState } from 'react'
import { createDraftSession, editDraftSession, mergeDraftSession, restoreDraftSession, requestOrderDraft, hasOrderLines, mergeStructuredDraftSession } from '../utils/orderDraftFromThread'

/** One draft per import; edited rows are indivisible when AI splits the item list. */
export default function useThreadOrderDraft(initialForm, { businessId, products, catalogBusinessId, getSession }) {
  const [formData, commitForm] = useState(initialForm)
  const [notice, setNotice] = useState({ status: 'idle', error: '' })
  const form = useRef(formData)
  const session = useRef(null)
  const currentBusiness = useRef(businessId)
  const mounted = useRef(true)
  const importedBusiness = useRef(null)
  currentBusiness.current = businessId

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; session.current = null; importedBusiness.current = null }
  }, [])

  useEffect(() => {
    if (importedBusiness.current !== null && importedBusiness.current !== businessId) {
      importedBusiness.current = null
      session.current = null
      setNotice({ status: 'idle', error: '' })
    }
  }, [businessId])

  const apply = next => {
    form.current = structuredClone(next)
    commitForm(next)
  }
  const setFormData = update => {
    const next = typeof update === 'function' ? update(structuredClone(form.current)) : update
    if (session.current) session.current.state = editDraftSession(session.current.state, next)
    apply(next)
  }
  const begin = (original, thread) => {
    importedBusiness.current = businessId
    session.current = { state: createDraftSession(original), thread, businessId, started: false }
    apply(structuredClone(original))
    setNotice({ status: hasOrderLines(thread) ? 'idle' : 'loading', error: '' })
  }
  const cancelPending = () => {
    session.current = null
    setNotice({ status: 'idle', error: '' })
  }
  const clear = () => {
    importedBusiness.current = null
    cancelPending()
  }
  const restoreOriginal = () => {
    if (!session.current) return
    const restored = restoreDraftSession(session.current.state)
    clear()
    importedBusiness.current = businessId
    apply(restored.form)
  }

  useEffect(() => {
    const pending = session.current
    if (!pending || pending.started || pending.businessId !== businessId || catalogBusinessId !== businessId) return
    pending.started = true
    if (hasOrderLines(pending.thread)) {
      pending.state = mergeStructuredDraftSession(pending.state, pending.thread, products)
      apply(pending.state.form)
      return
    }
    const isCurrent = () => mounted.current && session.current === pending && currentBusiness.current === pending.businessId
    requestOrderDraft(pending.thread, products, { getSession }).then(draft => {
      if (!isCurrent()) return
      pending.state = mergeDraftSession(pending.state, draft, products)
      form.current = structuredClone(pending.state.form)
      commitForm(pending.state.form)
      setNotice({ status: 'completed', error: '' })
    }).catch(error => {
      if (!isCurrent()) return
      setNotice({ status: 'error', error: error.message || 'No se pudo completar el pedido con IA. Puede continuar manualmente.' })
    })
  }, [businessId, products, catalogBusinessId, getSession, notice.status])

  return { formData, setFormData, begin, clear, cancelPending, restoreOriginal, isImported: importedBusiness.current === businessId, ...notice }
}
