import React, { useEffect } from 'react'
import { Transition, TransitionChild } from '@headlessui/react'
import { getImageUrl } from '../utils/getImageUrl'
import { generateWhatsAppLinkForProducts } from '../utils/generateWhatsappLink'
import { useApp } from '../context/AppContext'
import trashIcon from '../assets/trash.svg'
import emptyBox from '../assets/empty-box.png'
import whatsappIcon from '../assets/whatsapp.svg'

export default function CartModal({ isOpen }) {
  const { cart: products, removeItem, setShowCartModal } = useApp()

  const handleWhatsAppClick = () => {
    const url = generateWhatsAppLinkForProducts(products)
    window.open(url, '_blank')
  }

  const totalPrice = products.reduce((acc, product) => acc + product.price, 0);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden')
    } else {
      document.body.classList.remove('overflow-hidden')
    }
    return () => document.body.classList.remove('overflow-hidden')
  }, [isOpen])

  const onClose = () => {
    setShowCartModal(false)
  }

  return (
    <Transition show={isOpen} appear>
      <div
        className='fixed inset-0 z-50 flex items-center justify-end bg-black/30'
        onClick={onClose}
      >
        <TransitionChild
          as={React.Fragment}
          enter='transition transform duration-300 ease-out'
          enterFrom='opacity-0 translate-x-full'
          enterTo='opacity-100 translate-x-0'
          leave='transition transform duration-200 ease-in'
          leaveFrom='opacity-100 translate-x-0'
          leaveTo='opacity-0 translate-x-full'
        >
          <div
            className='relative flex h-[100dvh] w-full max-w-md flex-col bg-white shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with your brand colors */}
            <div className='bg-gradient-to-r from-[#51c879] to-[#50bfe6] p-6 text-white'>
              <button
                onClick={onClose}
                className='absolute top-4 right-4 p-2 rounded-full hover:bg-white/20 transition-colors duration-200'
                aria-label='Cerrar carrito'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  className='h-6 w-6'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M6 18L18 6M6 6l12 12'
                  />
                </svg>
              </button>

              <div className='flex items-center space-x-3'>
                <div className='bg-white/20 p-2 rounded-lg'>
                  <svg className='w-6 h-6' fill='currentColor' viewBox='0 0 20 20'>
                    <path fillRule='evenodd' d='M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z' clipRule='evenodd' />
                  </svg>
                </div>
                <div>
                  <h2 className='text-xl font-bold'>Tus Cotizaciones</h2>
                  <p className='text-white/80 text-sm'>{products.length} {products.length === 1 ? 'producto' : 'productos'} para cotizar</p>
                </div>
              </div>
            </div>

            <div className='flex-grow overflow-y-auto p-6'>
              {products.length > 0 ? (
                <div className='space-y-4'>
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className='flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:shadow-md transition-shadow duration-200'
                    >
                      <img
                        src={getImageUrl(product.image_url)}
                        alt={product.name}
                        className='h-16 w-16 rounded-lg object-cover'
                      />

                      <div className='flex-1'>
                        <h3 className='font-semibold text-gray-800 text-sm leading-tight'>
                          {product.name}
                        </h3>
                        <p className='text-lg font-bold text-gray-800 mt-1'>
                          C$ {product.price}
                        </p>
                      </div>

                      <button
                        onClick={() => removeItem(product.id)}
                        className='p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200'
                        aria-label='Eliminar producto'
                      >
                        <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 20 20'>
                          <path fillRule='evenodd' d='M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z' clipRule='evenodd' />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='flex flex-grow flex-col items-center justify-center'>
                  <img
                    src={emptyBox}
                    alt='Carrito vacío'
                    className='mb-4 h-auto max-w-xs object-contain'
                  />
                  <p className='text-center text-lg font-bold text-gray-500'>
                    ¡Vaya! Tu carrito está vacío...
                    <br /> ¡Hora de llenarlo de sorpresas!
                  </p>
                </div>
              )}
            </div>

            <div className='border-t border-gray-200 p-6 space-y-4'>
              {products.length > 0 && (
                <>
                  <div className='flex justify-between items-center p-4 bg-gray-50 rounded-xl'>
                    <span className='text-lg font-semibold text-gray-700'>
                      Total
                    </span>
                    <span className='text-2xl font-bold text-gray-800'>
                      C$ {totalPrice}
                    </span>
                  </div>
                  
                  <button
                    onClick={handleWhatsAppClick}
                    className='flex w-full items-center justify-center space-x-3 bg-gradient-to-r from-[#51c879] to-[#50bfe6] hover:from-[#45b86b] hover:to-[#42a8d1] px-6 py-4 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]'
                  >
                    <svg className='w-6 h-6' fill='currentColor' viewBox='0 0 24 24'>
                      <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.787'/>
                    </svg>
                    <span>Solicitar Cotización</span>
                  </button>
                  

                </>
              )}

              <button
                onClick={onClose}
                className='flex w-full items-center justify-center px-6 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition-colors duration-200'
              >
                Seguir explorando
              </button>
            </div>
          </div>
        </TransitionChild>
      </div>
    </Transition>
  )
}
