import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const faqs = [
  {
    question: '¿Cómo hago un pedido?',
    answer: [
      'Elige el producto que te gusta desde nuestro catálogo.',
      'Presiona el botón "Cotizar por WhatsApp" y te llevará directamente a una conversación con nosotros.',
      'Confirmamos los detalles del pedido contigo: diseño, medidas, tiempo de entrega y forma de pago.',
      'Una vez confirmado, comenzamos a elaborar tu pedido.',
    ],
    type: 'steps',
  },
  {
    question: '¿Hacen productos personalizados?',
    answer: 'Sí, elaboramos productos personalizados. Compártenos los detalles según el producto: nombre, foto, diseño o medidas, y nosotros nos encargamos del resto.',
    type: 'text',
  },
  {
    question: '¿Hacen envíos a todo Nicaragua?',
    answer: 'Sí, realizamos envíos a todo el país.',
    type: 'text',
  },
  {
    question: '¿Qué métodos de pago aceptan?',
    answer: 'Aceptamos transferencia bancaria y pago en efectivo. Solicitamos un adelanto del 50% para comenzar a elaborar tu pedido y el saldo restante al momento del envío. Esto nos permite cubrir los materiales y garantizar que tu pedido sea elaborado en tiempo y forma.',
    type: 'text',
  },
]

function AccordionItem({ faq }) {
  const [open, setOpen] = useState(false)

  return (
    <div className='border-b border-gray-100 last:border-0'>
      <button
        onClick={() => setOpen(!open)}
        className='w-full flex items-center justify-between gap-4 py-5 text-left'
      >
        <span className='font-semibold text-gray-900'>{faq.question}</span>
        <svg
          className={`w-4 h-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}
        >
          <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
        </svg>
      </button>

      {open && (
        <div className='pb-5'>
          {faq.type === 'steps' ? (
            <ol className='flex flex-col gap-3'>
              {faq.answer.map((step, i) => (
                <li key={i} className='flex gap-3'>
                  <span className='shrink-0 w-5 h-5 rounded-full bg-[#51c879] text-white text-xs flex items-center justify-center font-semibold mt-0.5'>
                    {i + 1}
                  </span>
                  <span className='text-gray-600 leading-relaxed'>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className='text-gray-600 leading-relaxed'>{faq.answer}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function FAQ() {
  const navigate = useNavigate()

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

        <h1 className='text-2xl font-bold text-gray-900 mb-1'>Preguntas Frecuentes</h1>
        <p className='text-sm text-gray-400 mb-8'>MagicArte · Artesanía en MDF</p>

        <div>
          {faqs.map((faq) => (
            <AccordionItem key={faq.question} faq={faq} />
          ))}
        </div>

      </div>
    </div>
  )
}
