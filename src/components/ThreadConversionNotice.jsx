export default function ThreadConversionNotice({ conversion }) {
  if (!conversion.recovery) return null
  return (
    <div
      role='alert'
      className='mx-auto max-w-7xl rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-800'
    >
      El pedido ya se guardó. Falta vincularlo a WhatsApp; no cree otro pedido.
      <button
        className='ml-2 min-h-10 rounded-lg border border-gray-300 px-3 font-semibold'
        onClick={conversion.retryConversion}
      >
        Reintentar vínculo
      </button>
    </div>
  )
}
