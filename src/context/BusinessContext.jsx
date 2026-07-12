import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabaseClient'

// Fallback used before the multi_business migration has run (or if the
// public_businesses view can't be read). Keeps the app fully working with the
// original Magic Arte branding from src/index.css.
const DEFAULT_BUSINESS = {
  id: null,
  slug: 'magicarte',
  name: 'Magic Arte',
  primary_color: '#ffb6c1',
  secondary_color: '#51c879',
  accent_color: '#50bfe6',
  background_color: '#f8f9fa',
  text_color: '#1f2937',
  theme: 'light',
  font_primary: null,
  font_secondary: null,
  logo_url: null,
}

const ALL_BUSINESSES = {
  id: null,
  slug: 'all',
  name: 'Todos los negocios',
  primary_color: '#334155',
  secondary_color: '#64748b',
  accent_color: '#0f766e',
  background_color: '#f8f9fa',
  text_color: '#1f2937',
  theme: 'light',
  font_primary: null,
  font_secondary: null,
  logo_url: null,
}

const STORAGE_KEY = 'hq.currentBusinessSlug'

const BusinessContext = createContext(null)

// Theme variables we override on <html>. Listed so we can cleanly reset them
// when leaving the admin (so the public site keeps its index.css defaults).
const THEME_VARS = [
  '--color-primary',
  '--color-secondary',
  '--color-accent',
  '--color-background',
  '--color-text',
  '--font-primary',
  '--font-secondary',
]

function applyTheme(b) {
  const root = document.documentElement.style
  if (b.primary_color) root.setProperty('--color-primary', b.primary_color)
  if (b.secondary_color) root.setProperty('--color-secondary', b.secondary_color)
  if (b.accent_color) root.setProperty('--color-accent', b.accent_color)
  if (b.background_color) root.setProperty('--color-background', b.background_color)
  if (b.text_color) root.setProperty('--color-text', b.text_color)
  if (b.font_primary) root.setProperty('--font-primary', `'${b.font_primary}', sans-serif`)
  if (b.font_secondary) root.setProperty('--font-secondary', `'${b.font_secondary}', sans-serif`)
  document.documentElement.setAttribute('data-theme', b.theme || 'light')
}

function resetTheme() {
  const root = document.documentElement.style
  THEME_VARS.forEach((v) => root.removeProperty(v))
  document.documentElement.removeAttribute('data-theme')
}

export function BusinessProvider({ children }) {
  // Public-safe list (no financial columns) — always loaded, regardless of
  // auth, so the public storefront and admin theming always have something to
  // render. Used as the businesses list until we know a signed-in user's own
  // access (below).
  const [publicBusinesses, setPublicBusinesses] = useState([DEFAULT_BUSINESS])
  const [loading, setLoading] = useState(true)

  // Auth + per-user access. `authChecked` distinguishes "still checking" from
  // "checked, and there's no session" — needed so the root-redirect decision
  // (below) doesn't fire prematurely on the first render.
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  // The businesses THIS signed-in user can access (RLS-scoped read of the real
  // `businesses` table, not the public view). null = not loaded yet.
  const [myBusinesses, setMyBusinesses] = useState(null)

  const location = useLocation()
  const navigate = useNavigate()
  const isAdmin = location.pathname.startsWith('/admin')

  // The active business lives in the URL: /admin/<slug>/<tab>. localStorage only
  // remembers the last business so a bare /admin can redirect back to it.
  const segments = location.pathname.split('/')
  const urlSlug = isAdmin ? segments[2] || null : null
  const currentTab = isAdmin ? segments[3] || 'orders' : 'orders'
  const slug = urlSlug || localStorage.getItem(STORAGE_KEY) || DEFAULT_BUSINESS.slug
  const isAllBusinesses = isAdmin && urlSlug === 'all' && currentTab === 'finances'

  // Remember the last business we navigated to (for the /admin redirect).
  useEffect(() => {
    if (urlSlug && urlSlug !== 'all') localStorage.setItem(STORAGE_KEY, urlSlug)
  }, [urlSlug])

  // Load the public-safe businesses list.
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('public_businesses')
        .select('*')
        .order('sort_order', { ascending: true })
      if (!active) return
      if (!error && data && data.length) setPublicBusinesses(data)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  // Track auth state.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setAuthChecked(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Once signed in, load exactly the businesses this user has access to (RLS
  // on the `businesses` table itself enforces this via user_businesses).
  useEffect(() => {
    if (!session) {
      setMyBusinesses(null)
      return
    }
    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .order('sort_order', { ascending: true })
      if (!active) return
      setMyBusinesses(!error && data ? data : [])
    })()
    return () => {
      active = false
    }
  }, [session])

  // The list consumers see: access-scoped once we know it, else the public
  // list (bootstrap/anon/public-site default — never blanks the switcher).
  const businesses = session && myBusinesses ? myBusinesses : publicBusinesses

  // Resolve strictly from the URL slug. Until the businesses list loads, an
  // unmatched slug yields a null id (below) so pages wait instead of fetching
  // another business's rows. `currentBusiness` itself never goes null so the
  // chrome/switcher can always render something.
  const matchedBusiness = useMemo(
    () => businesses.find((b) => b.slug === slug) || null,
    [businesses, slug],
  )
  const currentBusiness = isAllBusinesses ? ALL_BUSINESSES : matchedBusiness || DEFAULT_BUSINESS

  // Switch business: stay on the same tab under the newly selected business.
  const setBusinessSlug = useCallback((nextSlug) => {
    if (nextSlug === 'all') {
      navigate('/admin/all/finances')
      return
    }
    localStorage.setItem(STORAGE_KEY, nextSlug)
    navigate(`/admin/${nextSlug}/${currentTab}`)
  }, [currentTab, navigate])

  // Guard: once we know a signed-in user's real access list, bounce them off
  // any admin URL (including a bare /admin, or a stale/no-access business)
  // that isn't theirs, onto the first business they can actually see.
  useEffect(() => {
    if (!isAdmin || !session || !myBusinesses || myBusinesses.length === 0) return
    if (isAllBusinesses) return
    if (!myBusinesses.some((b) => b.slug === urlSlug)) {
      navigate(`/admin/${myBusinesses[0].slug}/${currentTab}`, { replace: true })
    }
  }, [isAdmin, session, myBusinesses, urlSlug, currentTab, navigate, isAllBusinesses])

  // Root-redirect decision for the public homepage: a signed-in user with no
  // Magic Arte access has no reason to land on its storefront — send them
  // straight to their own dashboard instead. `pending` covers the brief window
  // before we know (so Home/analytics don't act on a guess), `to` is the
  // target path once we've decided a redirect is actually needed.
  const rootRedirectPending = !authChecked || (Boolean(session) && myBusinesses === null)
  const hasMagicArteAccess = !session || !myBusinesses || myBusinesses.some((b) => b.slug === 'magicarte')
  const rootRedirectTo =
    !rootRedirectPending && session && myBusinesses && myBusinesses.length > 0 && !hasMagicArteAccess
      ? `/admin/${myBusinesses[0].slug}/orders`
      : null

  // Apply per-business theme inside the admin; revert to index.css defaults
  // everywhere else so the public site is never re-skinned.
  useEffect(() => {
    if (isAdmin) applyTheme(currentBusiness)
    else resetTheme()
    return () => {
      // on unmount, leave the public site in its default state
      if (!isAdmin) resetTheme()
    }
  }, [isAdmin, currentBusiness])

  // Magic Arte's id — public-facing pages always scope to this, regardless of
  // which business is selected in the admin switcher, and regardless of
  // whether the signed-in user (if any) has admin access to it.
  const publicBusinessId = useMemo(
    () => publicBusinesses.find((b) => b.slug === 'magicarte')?.id ?? null,
    [publicBusinesses],
  )

  const value = useMemo(
    () => ({
      businesses,
      currentBusiness,
      // null until the URL slug matches a loaded business — pages guard on this
      // before fetching, so a switch never pulls the previous business's rows.
      currentBusinessId: isAllBusinesses ? null : matchedBusiness?.id ?? null,
      currentTab,
      isAllBusinesses,
      defaultBusinessSlug: businesses[0]?.slug || DEFAULT_BUSINESS.slug,
      publicBusinessId,
      setBusinessSlug,
      loading,
      rootRedirectPending,
      rootRedirectTo,
    }),
    [
      businesses,
      currentBusiness,
      matchedBusiness,
      currentTab,
      isAllBusinesses,
      publicBusinessId,
      loading,
      rootRedirectPending,
      rootRedirectTo,
      setBusinessSlug,
    ],
  )

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness() {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusiness must be used within a BusinessProvider')
  return ctx
}
