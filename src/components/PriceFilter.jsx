import { useState, useEffect } from 'react'

export default function PriceFilter({ products, onPriceFilter }) {
  const [priceRange, setPriceRange] = useState({ min: 0, max: 1000 })
  const [selectedRange, setSelectedRange] = useState({ min: 0, max: 1000 })

  useEffect(() => {
    if (products.length > 0) {
      const prices = products.map(p => Number(p.price))
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      setPriceRange({ min, max })
      setSelectedRange({ min, max })
    }
  }, [products])

  const handleRangeChange = (type, value) => {
    const newRange = { ...selectedRange, [type]: Number(value) }
    setSelectedRange(newRange)
    onPriceFilter(newRange)
  }

  const resetFilter = () => {
    setSelectedRange(priceRange)
    onPriceFilter(priceRange)
  }

  return (
    <div className='bg-white rounded-2xl p-6 shadow-lg mb-6'>
      <div className='flex items-center justify-between mb-4'>
        <h3 className='text-lg font-semibold text-gray-800'>Filtrar por Precio</h3>
        <button
          onClick={resetFilter}
          className='text-sm text-[#51c879] hover:text-[#45b86b] font-medium'
        >
          Limpiar
        </button>
      </div>

      <div className='space-y-4'>
        <div className='flex gap-4'>
          <div className='flex-1'>
            <label className='block text-sm font-medium text-gray-600 mb-2'>Mínimo</label>
            <input
              type='number'
              min={priceRange.min}
              max={priceRange.max}
              value={selectedRange.min}
              onChange={(e) => handleRangeChange('min', e.target.value)}
              className='w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
            />
          </div>
          <div className='flex-1'>
            <label className='block text-sm font-medium text-gray-600 mb-2'>Máximo</label>
            <input
              type='number'
              min={priceRange.min}
              max={priceRange.max}
              value={selectedRange.max}
              onChange={(e) => handleRangeChange('max', e.target.value)}
              className='w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
            />
          </div>
        </div>

        <div className='text-center text-sm text-gray-600'>
          C$ {selectedRange.min} - C$ {selectedRange.max}
        </div>
      </div>
    </div>
  )
}