import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const sections = [
  {
    title: 'Tiempos de Elaboración',
    body: 'Todos nuestros productos se elaboran por encargo. El tiempo de elaboración es de 7 a 15 días hábiles aproximadamente, según el diseño, complejidad del pedido y disponibilidad de agenda.',
  },
  {
    title: 'Tiempos de Envío',
    body: 'Envíos en Managua se realizan usualmente el mismo día una vez el pedido está listo. Para envíos a los departamentos, el tiempo depende de la distancia y las políticas de la agencia de envío.',
  },
  {
    title: 'Costo de Envío',
    body: 'El costo varía según el tamaño del paquete y el destino. Te informamos el valor exacto al confirmar tu pedido. Tratamos de ser lo más cuidadosos posible en cómo empacamos y enviamos cada pedido.',
  },
  {
    title: 'Pedido Dañado',
    body: 'Si tu pedido llega en mal estado, escríbenos por WhatsApp con una foto que muestre el daño y lo evaluamos para hacer la reposición sin costo adicional.',
  },
  {
    title: 'Color del Producto',
    body: 'Todas las fotos de nuestros productos corresponden a imágenes reales. Sin embargo, los colores pueden presentar variaciones dependiendo de la pantalla o dispositivo desde el cual se visualiza el producto.',
  },
]

export default function ShippingPolicy() {
  const navigate = useNavigate()

  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='max-w-lg mx-auto px-5 py-10'>

        <button
          onClick={() => navigate(-1)}
          className='flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-8'
        >
          <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
            <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
          </svg>
          Volver
        </button>

        <h1 className='text-2xl font-bold text-gray-900 mb-1'>Políticas</h1>
        <p className='text-sm text-gray-400 mb-10'>MagicArte · Artesanía en MDF</p>

        <div className='flex flex-col divide-y divide-gray-100'>
          {sections.map((s) => (
            <div key={s.title} className='py-6'>
              <h2 className='text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2'>{s.title}</h2>
              <p className='text-gray-800 leading-relaxed'>{s.body}</p>
            </div>
          ))}
        </div>


      </div>
    </div>
  )
}
