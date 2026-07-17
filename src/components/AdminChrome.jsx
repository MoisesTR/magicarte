import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabaseClient'
import { useBusiness } from '../context/BusinessContext'
import BusinessSwitcher from './BusinessSwitcher'

const TABS = [
  { tab: 'orders', label: 'Pedidos' },
  { tab: 'products', label: 'Productos' },
  { tab: 'inventory', label: 'Inventario' },
  { tab: 'clients', label: 'Clientes' },
  { tab: 'finances', label: 'Finanzas' },
]

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
  return (
    <header
      className={`sticky top-0 z-30 border-b ${borderCls} print:hidden`}
      style={{ backgroundColor: bg, color: fg }}
      data-admin-chrome
    >
      <div className='mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5'>
        {/* neutral operator-console brand */}
        <div className='flex items-center gap-2 pr-1'>
          <span
            className='grid h-7 w-7 place-items-center rounded-lg text-xs font-bold text-white'
            style={{ backgroundColor: accent }}
          >
            HQ
          </span>
          <span className='text-sm font-semibold opacity-80'>Studio HQ</span>
        </div>

        <BusinessSwitcher />

        {/* nav tabs — scoped to the current business */}
        <nav className='order-3 flex w-full items-center gap-1 overflow-x-auto scrollbar-hide sm:order-none sm:w-auto'>
          {TABS.map((t) => (
            <NavLink
              key={t.tab}
              to={
                isAllBusinesses && t.tab === 'finances'
                  ? '/admin/all/finances'
                  : `/admin/${defaultBusinessSlug || currentBusiness.slug}/${t.tab}`
              }
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : 'opacity-70 hover:opacity-100'
                }`
              }
              style={({ isActive }) => (isActive ? { backgroundColor: accent } : undefined)}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className={`ml-auto rounded-lg border ${borderCls} px-3 py-1.5 text-sm font-medium opacity-80 transition-colors hover:opacity-100`}
        >
          Salir
        </button>
      </div>
    </header>
  )
}
