import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { useBusiness } from '../context/BusinessContext'

function Dot({ color }) {
  return (
    <span
      className='inline-block h-3 w-3 rounded-full ring-1 ring-black/10'
      style={{ backgroundColor: color || '#ccc' }}
    />
  )
}

export default function BusinessSwitcher() {
  const { businesses, currentBusiness, setBusinessSlug, isAllBusinesses } = useBusiness()

  return (
    <Menu as='div' className='relative'>
      <MenuButton className='flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50'>
        {currentBusiness.logo_url ? (
          <img src={currentBusiness.logo_url} alt='' className='h-5 w-5 rounded object-contain' />
        ) : (
          <Dot color={currentBusiness.primary_color} />
        )}
        <span className='max-w-[10rem] truncate'>{currentBusiness.name}</span>
        <svg className='h-4 w-4 text-gray-400' viewBox='0 0 20 20' fill='currentColor'>
          <path
            fillRule='evenodd'
            d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z'
            clipRule='evenodd'
          />
        </svg>
      </MenuButton>

      <MenuItems className='absolute left-0 z-40 mt-2 w-60 origin-top-left rounded-xl border border-black/10 bg-white p-1 shadow-lg focus:outline-none'>
        <p className='px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400'>
          Negocios
        </p>
        <MenuItem>
          <button
            onClick={() => setBusinessSlug('all')}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm data-[focus]:bg-gray-100 ${
              isAllBusinesses ? 'font-semibold text-gray-900' : 'text-gray-700'
            }`}
          >
            <span className='grid h-5 w-5 place-items-center rounded bg-slate-700 text-[10px] font-bold text-white'>HQ</span>
            <span className='flex-1'>Todos los negocios</span>
            {isAllBusinesses && <span className='text-xs'>✓</span>}
          </button>
        </MenuItem>
        <div className='my-1 border-t border-gray-100' />
        {businesses.map((b) => {
          const active = b.slug === currentBusiness.slug
          return (
            <MenuItem key={b.slug}>
              <button
                onClick={() => setBusinessSlug(b.slug)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm data-[focus]:bg-gray-100 ${
                  active ? 'font-semibold text-gray-900' : 'text-gray-700'
                }`}
              >
                {b.logo_url ? (
                  <img src={b.logo_url} alt='' className='h-5 w-5 rounded object-contain' />
                ) : (
                  <Dot color={b.primary_color} />
                )}
                <span className='flex-1 truncate'>{b.name}</span>
                {active && (
                  <svg className='h-4 w-4 text-gray-500' viewBox='0 0 20 20' fill='currentColor'>
                    <path
                      fillRule='evenodd'
                      d='M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.79 6.8-6.79a1 1 0 011.4 0z'
                      clipRule='evenodd'
                    />
                  </svg>
                )}
              </button>
            </MenuItem>
          )
        })}
      </MenuItems>
    </Menu>
  )
}
