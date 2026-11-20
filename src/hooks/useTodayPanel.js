import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../config/supabaseClient'
import { fetchTodayPanel } from '../data/today'

export default function useTodayPanel(businessId) {
  const [auth, setAuth] = useState({ user: null, checking: true })
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let active = true
    let authChanged = false
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true
      if (active) setAuth({ user: session?.user || null, checking: false })
    })
    supabase.auth.getUser().then(({ data }) => {
      if (active && !authChanged) setAuth({ user: data.user, checking: false })
    }).catch(() => {
      if (active && !authChanged) setAuth({ user: null, checking: false })
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [])

  const enabled = Boolean(auth.user && businessId)
  const query = useQuery({
    queryKey: ['today-panel', businessId, auth.user?.id],
    queryFn: () => fetchTodayPanel(businessId),
    enabled, retry: false, staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: false,
  })
  const { refetch } = query

  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      setNow(new Date())
      refetch({ cancelRefetch: false })
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled, refetch])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  return {
    ...query, user: auth.user, checkingAuth: auth.checking, now,
    onLogin: user => setAuth({ user, checking: false }),
    refresh: () => { setNow(new Date()); return refetch({ cancelRefetch: false }) },
    loading: auth.checking || Boolean(auth.user && (!businessId || query.isPending)),
  }
}
