import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchOrderForBusiness } from '../data/orders'

/** Opens full business-scoped editor data, including orders beyond the list cap. */
export default function useOrderDeepLink(orders, onOpen, businessId, enabled = false) {
  const location = useLocation()
  const navigate = useNavigate()
  const handled = useRef(null)
  const openEditor = useRef(onOpen)
  openEditor.current = onOpen

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const id = params.get('order')
    if (!id) {
      handled.current = null
      return
    }
    const key = `${businessId}:${id}`
    if (!enabled || businessId == null || businessId === '' || handled.current === key) return
    let active = true
    const consume = () => {
      handled.current = key
      params.delete('order')
      navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state: location.state })
    }
    const matches = row => row && String(row.id) === id && String(row.business_id) === String(businessId)
    const loaded = orders.find(matches)
    if (loaded) {
      openEditor.current(loaded)
      consume()
      return
    }

    const loadDetail = async () => {
      try {
        const { data, error } = await fetchOrderForBusiness(id, businessId)
        if (!active) return
        if (error) throw error
        if (matches(data)) openEditor.current(data)
        else toast.error('No se encontró el pedido en este negocio.')
        consume()
      } catch {
        if (!active) return
        toast.error('No se pudo abrir el pedido. Intente de nuevo desde WhatsApp.')
        consume()
      }
    }
    loadDetail()
    return () => { active = false }
  }, [orders, enabled, businessId, location, navigate])
}
