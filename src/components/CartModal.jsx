import React, { useEffect } from 'react'
import { Transition, TransitionChild } from '@headlessui/react'
import { getImageUrl } from '../utils/getImageUrl'
import { generateWhatsAppLinkForProducts } from '../utils/generateWhatsappLink'
import { useApp } from '../context/AppContext'
import trashIcon from '../assets/trash.svg'
import emptyBox from '../assets/empty-box.png'
import whatsappIcon from '../assets/whatsapp.svg'

export default function CartModal({ isOpen, onClose }) {
  const { cart: products, removeItem } = useApp()

  const handleWhatsAppClick = () => {
    const url = generateWhatsAppLinkForProducts(products)
    window.open(url, '_blank')
  }

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden')
    } else {
      document.body.classList.remove('overflow-hidden')
    }
    return () => document.body.classList.remove('overflow-hidden')
  }, [isOpen])

  return (
    <Transition show={isOpen} appear>
      <div
        className='fixed inset-0 z-50 flex items-center justify-end bg-black/30 backdrop-blur-sm'
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
            className='relative flex h-[100dvh] w-full max-w-md flex-col rounded-lg bg-white p-6 pt-6 shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            {/* 🔹 Botón de cerrar */}
            <button
              onClick={onClose}
              className='absolute top-4 right-4 cursor-pointer text-gray-600 hover:text-gray-800 focus:outline-none'
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

            <h2 className='mb-4 text-center text-2xl font-bold text-black'>
              ¡Tu Carrito!
            </h2>

            <div className='flex-grow space-y-4 overflow-x-hidden overflow-y-auto pr-2'>
              {products.length > 0 ? (
                products.map((product) => (
                  <div
                    key={product.id}
                    className='flex items-center gap-4 border-b pb-4 last:border-0'
                  >
                    <img
                      src={getImageUrl(product.image_url)}
                      alt={product.name}
                      className='h-20 w-20 rounded-md object-cover'
                    />

                    <div className='flex flex-1 flex-col justify-center'>
                      <h3 className='text-base font-medium text-black'>
                        {product.name}
                      </h3>
                      <p className='text-danger text-base font-semibold'>
                        C$ {product.price}
                      </p>
                    </div>

                    {/* 🔹 Botón para eliminar producto */}
                    <div className='group relative'>
                      <button
                        onClick={() => removeItem(product.id)}
                        className='text-danger cursor-pointer p-1 transition-transform duration-150 hover:scale-110 hover:text-red-800 focus:outline-none'
                        aria-label='Eliminar producto'
                      >
                        <img
                          src={trashIcon}
                          alt='Eliminar'
                          className='h-6 w-6'
                        />
                      </button>
                    </div>
                  </div>
                ))
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

            <div className='mt-4 flex-shrink-0 space-y-3 pb-[env(safe-area-inset-bottom)]'>
              {products.length > 0 && (
                <button
                  onClick={handleWhatsAppClick}
                  className='flex w-full items-center justify-center space-x-2 rounded bg-green-500 px-4 py-2 font-semibold text-white shadow transition duration-200 hover:bg-green-600 focus:outline-none'
                >
                  <img src={whatsappIcon} alt='WhatsApp' className='h-6 w-6' />
                  <span>Enviar por WhatsApp</span>
                </button>
              )}

              <button
                onClick={onClose}
                className='flex w-full items-center justify-center space-x-2 rounded bg-gray-400 px-4 py-2 font-semibold text-white shadow transition duration-200 hover:bg-gray-500 focus:outline-none'
              >
                <span>Cerrar</span>
              </button>
            </div>
          </div>
        </TransitionChild>
      </div>
    </Transition>
  )
}
