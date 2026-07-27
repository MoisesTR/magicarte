import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { useBusiness } from '../context/BusinessContext'

function Dot({ color }) {
  return (
    <span
      aria-hidden='true'
      className='inline-block h-5 w-5 rounded-md ring-1 ring-black/10 shadow-sm'
      style={{ backgroundColor: color || '#ccc' }}
    />
  )
}

function EmaAccessoriesIcon() {
  return (
    <span
      aria-hidden='true'
      className='grid h-5 w-5 place-items-center rounded-md bg-violet-100 text-violet-700 ring-1 ring-violet-200'
    >
      <svg className='h-3.5 w-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <circle cx='12' cy='5' r='2.25' />
        <path d='M12 7.25c-3.25 3.1-4.5 5.5-4.5 8a4.5 4.5 0 009 0c0-2.5-1.25-4.9-4.5-8z' />
        <path d='M12 11.5v5' />
      </svg>
    </span>
  )
}

function BusinessMark({ business }) {
  if (business.logo_url) {
    return <img src={business.logo_url} alt='' className='h-5 w-5 rounded object-contain' />
  }

  if (business.slug === 'ema-accesorios') return <EmaAccessoriesIcon />

  return <Dot color={business.primary_color} />
}

export default function BusinessSwitcher() {
  const { businesses, currentBusiness, setBusinessSlug, isAllBusinesses } = useBusiness()

  return (
    <Menu as='div' className='relative'>
      <MenuButton aria-label={`Negocio actual: ${currentBusiness.name}. Cambiar negocio`} className='flex min-h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-all hover:-translate-y-px hover:bg-gray-50 hover:shadow-md'>
        <BusinessMark business={currentBusiness} />
        <span className='max-w-[7rem] truncate sm:max-w-[10rem]'>{currentBusiness.name}</span>
        <svg className='h-4 w-4 text-gray-400' viewBox='0 0 20 20' fill='currentColor'>
          <path
            fillRule='evenodd'
            d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z'
            clipRule='evenodd'
          />
        </svg>
      </MenuButton>

      <MenuItems transition className='absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 sm:left-0 sm:right-auto sm:origin-top-left focus:outline-none'>
        <p className='px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400'>
          Cambiar negocio
        </p>
        <MenuItem>
          <button
            onClick={() => setBusinessSlug('all')}
            className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm data-[focus]:bg-gray-100 ${
              isAllBusinesses ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-700'
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
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm data-[focus]:bg-gray-100 ${
                  active ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-700'
                }`}
              >
                <BusinessMark business={b} />
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
