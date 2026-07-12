import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { CONTACT_PHONE } from '../utils/constants'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
}

const reveal = (delay = 0) => ({
  variants: fadeUp,
  initial: 'hidden',
  whileInView: 'show',
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.5, ease: 'easeOut', delay },
})

const values = [
  {
    title: 'Hecho a mano',
    description: 'Cada pieza la elaboramos nosotros, una por una, en nuestro propio taller.',
    icon: (
      <path strokeLinecap='round' strokeLinejoin='round' d='M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z' />
    ),
  },
  {
    title: 'Materiales de calidad',
    description: 'Trabajamos con madera y materiales seleccionados para que tu pieza dure.',
    icon: (
      <path strokeLinecap='round' strokeLinejoin='round' d='m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9' />
    ),
  },
  {
    title: 'Diseños personalizados',
    description: 'Nombres, fotos, fechas o ideas propias: lo convertimos en realidad.',
    icon: (
      <path strokeLinecap='round' strokeLinejoin='round' d='M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42' />
    ),
  },
  {
    title: 'Envíos a todo el país',
    description: 'Empacamos con cuidado y enviamos tu pedido a cualquier parte de Nicaragua.',
    icon: (
      <path strokeLinecap='round' strokeLinejoin='round' d='M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12' />
    ),
  },
]

const photos = [
  { src: '/assets/taller/taller-3.webp', caption: 'Herramientas y prensas para un acabado firme.' },
  { src: '/assets/taller/taller-4.webp', caption: 'Todo organizado para cuidar cada detalle de tu pedido.' },
  { src: '/assets/taller/taller-2.webp', caption: 'Nuestra máquina láser al centro y las pinturas listas para dar color.' },
  { src: '/assets/taller/taller-1.webp', caption: 'Una vista de nuestro taller, donde nace cada pieza.' },
]

export default function About() {
  const navigate = useNavigate()
  const whatsappLink = `https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent('Hola! Me gustaría más información sobre MagicArte.')}`

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

        <h1 className='text-2xl font-bold text-gray-900 mb-1'>Acerca de Nosotros</h1>
        <p className='text-sm text-gray-400 mb-8'>
          <span className='text-[#51c879] font-semibold'>Magic</span><span className='text-[#50bfe6] font-semibold'>Arte</span> · Artesanía en Madera
        </p>

        <motion.div {...reveal()} className='flex flex-col gap-4 text-gray-700 leading-relaxed mb-10'>
          <p>
            En <span className='font-semibold'>MagicArte</span> somos una pareja de emprendedores nicaragüenses
            dedicada a la artesanía en madera. Lo que comenzó como un gusto por crear con las manos
            se convirtió en un taller donde elaboramos piezas personalizadas con dedicación y cariño.
          </p>
          <p>
            Cada producto que ves en nuestro catálogo se diseña y se elabora aquí mismo, en nuestro
            taller, usando herramientas profesionales y materiales de calidad. No revendemos:
            <span className='font-semibold'> todo lo hacemos nosotros</span>, cuidando cada corte,
            cada acabado y cada detalle antes de que llegue a tus manos.
          </p>
          <p>
            Queremos que conozcas el lugar donde damos vida a tus ideas. Estas fotos son de nuestro
            espacio de trabajo real, para que compres con la confianza de saber quién y dónde se
            elabora tu pieza.
          </p>
        </motion.div>

        <div className='grid grid-cols-2 gap-3 mb-12'>
          {values.map((v, i) => (
            <motion.div key={v.title} {...reveal(i * 0.08)} className='bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-2'>
              <span className='w-9 h-9 rounded-full bg-[#51c879]/10 text-[#51c879] flex items-center justify-center'>
                <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.7}>
                  {v.icon}
                </svg>
              </span>
              <h3 className='font-semibold text-gray-900 text-sm'>{v.title}</h3>
              <p className='text-xs text-gray-500 leading-relaxed'>{v.description}</p>
            </motion.div>
          ))}
        </div>

        <h2 className='text-lg font-bold text-gray-900 mb-1'>Conoce nuestro taller</h2>
        <p className='text-sm text-gray-400 mb-6'>El lugar donde se elabora cada pedido.</p>

        <div className='flex flex-col gap-5 mb-12'>
          {photos.map((photo, i) => (
            <motion.figure key={photo.src} {...reveal(i * 0.08)} className='overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm'>
              <img
                src={photo.src}
                alt={photo.caption}
                loading='lazy'
                className='w-full object-cover'
              />
              <figcaption className='flex items-center gap-2.5 px-4 py-3 text-sm text-gray-600'>
                <span className='shrink-0 w-1.5 h-1.5 rounded-full bg-[#51c879]' />
                {photo.caption}
                <span className='ml-auto text-xs text-gray-300'>{i + 1}/{photos.length}</span>
              </figcaption>
            </motion.figure>
          ))}
        </div>

        <motion.div {...reveal()} className='bg-white rounded-2xl border border-gray-100 p-6 text-center'>
          <h2 className='text-lg font-bold text-gray-900 mb-2'>¿Listo para tu pieza personalizada?</h2>
          <p className='text-sm text-gray-500 mb-5'>Escríbenos y con gusto te ayudamos a hacerla realidad.</p>
          <a
            href={whatsappLink}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center justify-center gap-2 bg-[#51c879] hover:bg-[#45b56b] text-white font-semibold px-6 py-3 rounded-full transition-colors'
          >
            <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
              <path d='M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.728-.979zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z' />
            </svg>
            Escríbenos por WhatsApp
          </a>
        </motion.div>

      </div>
    </div>
  )
}
