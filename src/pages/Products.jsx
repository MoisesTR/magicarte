import ProductCard from '../components/ProductCard'
import { useProductsInActiveSeason } from '../hooks/useProductsInActiveSeason'

export default function Products({ selectedCategory }) {
  const { data: products = [], isLoading } = useProductsInActiveSeason()

  const productFilter = (product) =>
    !selectedCategory ||
    selectedCategory.name === 'Todos' ||
    product.category_id === selectedCategory.id

  const productsToShow = products.filter(productFilter)

  return (
    <section className='py-8'>
      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        {isLoading && (
          <p className='text-center text-lg text-gray-500'>
            Cargando productos...
          </p>
        )}

        {!isLoading && productsToShow.length === 0 && (
          <div className='flex h-64 flex-col items-center justify-center text-center'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-16 w-16 text-gray-400'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 12h6m-6 4h6m-7 4h8a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h1z'
              />
            </svg>
            <p className='mt-4 text-lg font-semibold text-gray-700'>
              No hay productos disponibles
            </p>
            <p className='mt-1 text-gray-500'>Revisa más tarde.</p>
          </div>
        )}

        <div className='grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
          {productsToShow.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}
