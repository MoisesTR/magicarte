import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabaseClient'
import { useBusiness } from '../context/BusinessContext'
import BusinessSwitcher from './BusinessSwitcher'

const TABS = [
  { tab: 'orders', label: 'Pedidos', icon: 'M7 3h10a2 2 0 012 2v14l-3-2-4 2-4-2-3 2V5a2 2 0 012-2zm2 5h6m-6 4h4' },
  { tab: 'products', label: 'Productos', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { tab: 'inventory', label: 'Inventario', icon: 'M4 7.5L12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5m8-4.5L12 12m0 9v-9' },
  { tab: 'clients', label: 'Clientes', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8zm13 10v-2a4 4 0 00-3-3.87m-1-11.96a4 4 0 010 7.75' },
  { tab: 'notes', label: 'Notas', icon: 'M9 3h9a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V7l5-4zm0 0v4a1 1 0 001 1h4M8 13h8m-8 4h5' },
  { tab: 'finances', label: 'Finanzas', icon: 'M12 2v20m5-16.5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
]

function TabIcon({ path }) {
  return <svg aria-hidden='true' className='h-4 w-4 shrink-0' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'><path d={path} /></svg>
}

export default function AdminChrome() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentBusiness, isAllBusinesses, defaultBusinessSlug } = useBusiness()
  const [session, setSession] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const isAdmin = location.pathname.startsWith('/admin')
  // Only render the console on admin routes, and only once authenticated
  // (otherwise the page itself shows <AdminLogin/>).
  if (!isAdmin || !session) return null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  // The top bar follows the active business brand; the all-business view uses
  // the neutral Studio HQ palette.
  const dark = currentBusiness?.theme === 'dark'
  const bg = currentBusiness?.background_color || '#f8f9fa'
  const fg = currentBusiness?.text_color || '#1f2937'
  const accent = currentBusiness?.primary_color || '#51c879'
  const borderCls = dark ? 'border-white/15' : 'border-black/10'
  const tabBusinessSlug = isAllBusinesses ? defaultBusinessSlug : currentBusiness.slug
  return (
    <header
      className={`sticky top-0 z-40 border-b ${borderCls} shadow-sm backdrop-blur-xl print:hidden`}
      style={{ backgroundColor: `color-mix(in srgb, ${bg} 92%, transparent)`, color: fg }}
      data-admin-chrome
    >
      <div className='mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4'>
        {/* neutral operator-console brand */}
        <div className='flex items-center gap-2 pr-1' aria-label='Panel administrativo'>
          <span
            className='grid h-8 w-8 place-items-center rounded-xl text-xs font-bold text-white shadow-sm'
            style={{ backgroundColor: accent }}
          >
            HQ
          </span>
          <span className='hidden text-sm font-semibold opacity-80 lg:inline'>Studio HQ</span>
        </div>

        <BusinessSwitcher />

        {/* nav tabs — scoped to the current business */}
        <nav aria-label='Secciones del negocio' className={`order-3 flex w-full items-center gap-1 overflow-x-auto rounded-xl border p-1 scrollbar-hide sm:order-none sm:w-auto ${borderCls}`}>
          {TABS.map((t) => (
            <NavLink
              key={t.tab}
              to={
                isAllBusinesses && t.tab === 'finances'
                  ? '/admin/all/finances'
                  : `/admin/${tabBusinessSlug}/${t.tab}`
              }
              className={({ isActive }) =>
                `flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  isActive ? 'text-white shadow-sm' : 'opacity-70 hover:bg-black/5 hover:opacity-100'
                }`
              }
              style={({ isActive }) => (isActive ? { backgroundColor: accent, boxShadow: `0 4px 12px color-mix(in srgb, ${accent} 28%, transparent)` } : undefined)}
            >
              <TabIcon path={t.icon} />
              {currentBusiness?.slug === 'joyeria-trigueros' && t.tab === 'orders' ? 'Grabados' : t.label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className={`ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border ${borderCls} px-3 py-1.5 text-sm font-medium opacity-75 transition-all hover:bg-black/5 hover:opacity-100`}
        >
          <svg aria-hidden='true' className='h-4 w-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'><path d='M10 17l5-5-5-5m5 5H3m11-9h5a2 2 0 012 2v14a2 2 0 01-2 2h-5' /></svg>
          Salir
        </button>
      </div>
    </header>
  )
}
