export default function LoadingSpinner({ size = 'md', text = 'Cargando...' }) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  }

  return (
    <div className='flex flex-col items-center justify-center py-12'>
      <div className={`${sizeClasses[size]} animate-spin rounded-full border-4 border-gray-200 border-t-[#51c879] mb-4`}></div>
      <p className='text-gray-600 font-medium'>{text}</p>
    </div>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className='bg-white rounded-2xl shadow-lg overflow-hidden animate-pulse'>
      <div className='h-60 bg-gray-200'></div>
      <div className='p-6'>
        <div className='h-4 bg-gray-200 rounded mb-3'></div>
        <div className='h-6 bg-gray-200 rounded w-24 mb-4'></div>
        <div className='h-12 bg-gray-200 rounded'></div>
      </div>
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'>
      {Array.from({ length: count }).map((_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  )
}