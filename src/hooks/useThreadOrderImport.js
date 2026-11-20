import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  fetchWhatsAppThread,
  completeThreadConversion,
} from '../data/whatsappThreads'
import { threadOrderPrefill } from '../utils/whatsappFeed'

/** Import only scoped, open conversations. Conversion never creates an order itself. */
export default function useThreadOrderImport(onImport, businessId, enabled) {
  const location = useLocation(),
    navigate = useNavigate()
  const callback = useRef(onImport),
    source = useRef(null),
    handled = useRef(null),
    generation = useRef(0)
  const [recovery, setRecovery] = useState(null)
  callback.current = onImport
  useEffect(() => {
    const params = new URLSearchParams(location.search),
      id = params.get('fromThread')
    if (!id) {
      handled.current = null
      return
    }
    if (!enabled || !businessId || handled.current === `${businessId}:${id}`)
      return
    let active = true
    const request = generation.current
    const load = async () => {
      try {
        const { data, error } = await fetchWhatsAppThread(id, businessId)
        if (!active || request !== generation.current) return
        if (error) throw error
        if (
          !data ||
          String(data.id) !== id ||
          String(data.business_id) !== String(businessId) ||
          !['to_quote', 'sent', 'follow_up'].includes(data.status) ||
          data.order_id
        )
          throw new Error(
            'La conversación no está disponible para convertir en este negocio.'
          )
        source.current = data
        callback.current(threadOrderPrefill(data), data)
      } catch (error) {
        if (!active || request !== generation.current) return
        toast.error(error.message || 'No se pudo abrir la conversación.')
      }
      handled.current = `${businessId}:${id}`
      params.delete('fromThread')
      navigate(
        {
          pathname: location.pathname,
          search: params.toString(),
          hash: location.hash,
        },
        { replace: true }
      )
    }
    load()
    return () => {
      active = false
    }
  }, [location, navigate, businessId, enabled])

  const completeConversion = async (orderId) => {
    const thread = source.current
    if (!thread || !orderId) return true
    const pending = { threadId: thread.id, orderId, businessId }
    source.current = null // An order now exists: never create another on link failure.
    try {
      const { error } = await completeThreadConversion(
        thread.id,
        orderId,
        businessId
      )
      if (error) throw error
      setRecovery(null)
      return true
    } catch {
      setRecovery(pending)
      toast.error(
        'El pedido se guardó, pero no se pudo vincular a WhatsApp. Reintente el vínculo; no cree otro pedido.'
      )
      return false
    }
  }
  const retryConversion = async () => {
    if (!recovery) return
    try {
      const { error } = await completeThreadConversion(
        recovery.threadId,
        recovery.orderId,
        recovery.businessId
      )
      if (error) throw error
      setRecovery(null)
      toast.success('Pedido vinculado a WhatsApp')
    } catch (error) {
      toast.error('No se pudo vincular el pedido: ' + error.message)
    }
  }

  return {
    completeConversion,
    recovery,
    retryConversion,
    clearImport: () => {
      source.current = null
      generation.current += 1
    },
  }
}
