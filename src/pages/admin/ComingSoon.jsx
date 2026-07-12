import { useEffect, useState } from 'react'
import AdminLogin from '../../components/AdminLogin'
import { supabase } from '../../config/supabaseClient'
import { useBusiness } from '../../context/BusinessContext'

/**
 * Auth-gated placeholder for per-business pages that exist in the navigation but
 * aren't built yet (e.g. Hikari orders/products). Keeps the shell navigable while
 * each business's real screens are filled in one at a time.
 */
export default function ComingSoon({ title, note }) {
  const { currentBusiness } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser)
      setCheckingAuth(false)
    })
  }, [])

  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300'></div>
      </div>
    )
  }
  if (!user) return <AdminLogin onLogin={setUser} />

  return (
    <div className='min-h-screen bg-gray-50 flex items-center justify-center px-4'>
      <div className='max-w-md text-center'>
        <div
          className='mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl text-white'
          style={{ backgroundColor: currentBusiness?.primary_color || '#9ca3af' }}
        >
          <svg className='h-6 w-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 6v6m0 0v6m0-6h6m-6 0H6' />
          </svg>
        </div>
        <h1 className='text-xl font-bold text-gray-800'>{title}</h1>
        <p className='mt-1 text-sm text-gray-500'>{currentBusiness?.name}</p>
        {note && <p className='mt-3 text-sm text-gray-400'>{note}</p>}
      </div>
    </div>
  )
}
