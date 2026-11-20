/** Imported facts stay reviewable without expanding the normal lightweight workflow. */
export default function ThreadOrderDeliveryFields({ form, onChange }) {
  return (
    <fieldset className='min-w-0 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3'>
      <legend className='px-1 text-xs font-semibold text-gray-700'>Entrega acordada por WhatsApp</legend>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <label className='block text-xs text-gray-600'>Modalidad
          <select value={form.delivery_method || 'pickup'} onChange={event => onChange({ delivery_method: event.target.value })} className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm'>
            <option value='pickup'>Recoger en tienda</option>
            <option value='delivery'>Entrega / envío</option>
          </select>
        </label>
        <label className='block text-xs text-gray-600'>Fecha de entrega
          <input type='date' value={form.estimated_delivery_date || ''} onChange={event => onChange({ estimated_delivery_date: event.target.value })} className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm' />
        </label>
      </div>
      {form.delivery_method === 'delivery' && <>
        <label className='block text-xs text-gray-600'>Dirección / transportista
          <textarea value={form.delivery_address || ''} onChange={event => onChange({ delivery_address: event.target.value })} rows={2} className='mt-1 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm' />
        </label>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <label className='block text-xs text-gray-600'>Persona que recibe
            <input type='text' value={form.recipient_name || ''} onChange={event => onChange({ recipient_name: event.target.value })} className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm' />
          </label>
          <label className='block text-xs text-gray-600'>Teléfono de quien recibe
            <input type='tel' value={form.recipient_phone || ''} onChange={event => onChange({ recipient_phone: event.target.value })} className='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm' />
          </label>
        </div>
      </>}
    </fieldset>
  )
}
