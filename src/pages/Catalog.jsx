import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLogin from '../components/AdminLogin'
import { supabase } from '../config/supabaseClient'
import { CONTACT_PHONE, TABLE } from '../utils/constants'
import { getImageUrl } from '../utils/getImageUrl'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'

const DELIVERY_TIME = '7 a 15 días hábiles'
const PRODUCTION_DOMAIN = 'https://www.magicarte.net'

function formatPrice(price) {
  return `C$ ${Number(price || 0).toFixed(0)}`
}

function formatDimensions(product) {
  if (!product.width && !product.length) return null
  if (product.width && product.length) return `${product.width} × ${product.length} cm`
  return `${product.width || product.length} cm`
}

function ProductCard({ product }) {
  const dimensions = formatDimensions(product)
  const productUrl = `${PRODUCTION_DOMAIN}/product/${product.id}`
  const isOutOfStock = product.stock_quantity === 0

  return (
    <article className='catalog-product border border-gray-200 rounded-2xl overflow-hidden bg-white flex flex-col'>
      {/* Image */}
      <div className='relative aspect-square bg-gray-50 overflow-hidden'>
        <img
          src={getImageUrl(product.image_url)}
          alt={product.name}
          className='w-full h-full object-contain p-2'
          loading='lazy'
        />
        {isOutOfStock && (
          <div className='absolute top-2 right-2 bg-gray-800/80 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full'>
            Agotado
          </div>
        )}
      </div>

      {/* Content */}
      <div className='p-4 flex flex-col flex-1 gap-2'>
        <div className='flex items-start justify-between gap-2'>
          <h4 className='text-sm font-bold text-gray-900 leading-snug line-clamp-2 flex-1'>{product.name}</h4>
          <p className='text-base font-bold text-[#51c879] whitespace-nowrap shrink-0'>{formatPrice(product.price)}</p>
        </div>

        <p className='text-xs text-gray-500 leading-relaxed catalog-description line-clamp-3'>
          {product.description || 'Producto personalizado hecho a mano en madera.'}
        </p>

        <div className='mt-auto pt-2 flex items-center justify-between gap-2'>
          {dimensions ? (
            <span className='text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600'>
              📐 {dimensions}
            </span>
          ) : <span />}
          <a
            href={productUrl}
            className='text-[10px] text-gray-300 truncate max-w-[140px]'
          >
            magicarte.net/product/…
          </a>
        </div>
      </div>
    </article>
  )
}

export default function Catalog() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      setUser(authUser)
      setCheckingAuth(false)
    }
    checkUser()
  }, [])

  const { data: categories = [], isLoading: loadingCategories } = useSupabaseQuery(TABLE.CATEGORIES, {
    order: { column: 'order' },
  })

  const { data: products = [], isLoading: loadingProducts } = useSupabaseQuery(TABLE.PRODUCT, {
    filters: [{ column: 'is_visible', value: true }],
    order: { column: 'created_at', ascending: false },
  })

  const groupedProducts = useMemo(() => {
    const categoryOrderMap = new Map(categories.map((cat, i) => [cat.id, cat.order ?? i]))

    const sorted = [...products].sort((a, b) => {
      const orderA = categoryOrderMap.get(a.category_id) ?? Number.MAX_SAFE_INTEGER
      const orderB = categoryOrderMap.get(b.category_id) ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return new Date(b.created_at) - new Date(a.created_at)
    })

    const groups = categories
      .map((cat) => ({ ...cat, products: sorted.filter((p) => p.category_id === cat.id) }))
      .filter((cat) => cat.products.length > 0)

    const uncategorized = sorted.filter((p) => !p.category_id)
    if (uncategorized.length > 0) groups.push({ id: 'uncategorized', name: 'Otros', products: uncategorized })

    return groups
  }, [categories, products])

  const isLoading = checkingAuth || loadingCategories || loadingProducts
  const generatedDate = new Date().toLocaleDateString('es-NI', { year: 'numeric', month: 'long', day: 'numeric' })

  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#51c879]'></div>
      </div>
    )
  }

  if (!user) return <AdminLogin onLogin={(u) => setUser(u)} />

  return (
    <div className='min-h-screen bg-gray-100 print:bg-white'>

      {/* Toolbar — hidden on print */}
      <div className='print:hidden sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm'>
        <div className='max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
          <div>
            <h1 className='text-lg font-bold text-gray-900'>Catálogo para PDF</h1>
            <p className='text-xs text-gray-500'>{products.length} productos · {groupedProducts.length} categorías</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <button onClick={() => navigate('/admin/orders')} className='px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors'>
              Pedidos
            </button>
            <button onClick={() => navigate('/admin/products')} className='px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors'>
              Productos
            </button>
            <button onClick={() => window.print()} className='px-4 py-2 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity'>
              Imprimir / Guardar PDF
            </button>
          </div>
        </div>
      </div>

      <main className='catalog-document max-w-5xl mx-auto bg-white min-h-screen px-6 py-8 print:max-w-none print:px-0 print:py-0'>

        {/* Cover */}
        <section className='catalog-cover rounded-2xl overflow-hidden mb-10 print:rounded-none print:mb-8' style={{ background: 'linear-gradient(135deg, #51c879 0%, #50bfe6 100%)', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <div className='p-8 sm:p-12 text-white'>
            <p className='text-xs font-bold uppercase tracking-widest text-white/70 mb-2'>Catálogo de productos</p>
            <h2 className='text-4xl sm:text-5xl font-bold leading-tight'>MagicArte</h2>
            <p className='text-base text-white/80 mt-1'>Nicaragua</p>
            <p className='mt-4 text-base text-white/90 max-w-xl'>
              Regalos personalizados en madera, hechos a mano con amor y creatividad.
            </p>
            <div className='mt-6 flex flex-wrap gap-3 text-sm'>
              <div className='bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5'>
                <p className='text-white/70 text-xs mb-0.5'>WhatsApp</p>
                <p className='font-semibold'>{CONTACT_PHONE}</p>
              </div>
              <div className='bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5'>
                <p className='text-white/70 text-xs mb-0.5'>Tiempo de entrega</p>
                <p className='font-semibold'>{DELIVERY_TIME}</p>
              </div>
              <div className='bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5'>
                <p className='text-white/70 text-xs mb-0.5'>Actualizado</p>
                <p className='font-semibold'>{generatedDate}</p>
              </div>
              <div className='bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5'>
                <p className='text-white/70 text-xs mb-0.5'>Web</p>
                <p className='font-semibold'>magicarte.net</p>
              </div>
            </div>
          </div>
        </section>

        {/* Products */}
        {isLoading ? (
          <div className='py-20 text-center text-gray-400'>Cargando catálogo...</div>
        ) : groupedProducts.length === 0 ? (
          <div className='py-20 text-center text-gray-400'>No hay productos visibles.</div>
        ) : (
          <div className='space-y-10'>
            {groupedProducts.map((category) => (
              <section key={category.id} className='catalog-category'>
                {/* Category Header */}
                <div className='flex items-center gap-3 mb-5'>
                  <h3 className='text-xl font-bold text-gray-900'>{category.name}</h3>
                  <div className='flex-1 h-px bg-gray-200'></div>
                  <span className='text-xs font-semibold text-gray-400 shrink-0'>
                    {category.products.length} producto{category.products.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className='catalog-grid grid grid-cols-2 lg:grid-cols-3 gap-5'>
                  {category.products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className='catalog-footer mt-12 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500'>
          <div>
            <p className='font-bold text-gray-900'>MagicArte Nicaragua</p>
            <p className='text-xs mt-0.5'>Artesanía en Madera · Hecho con amor</p>
          </div>
          <div className='text-right text-xs text-gray-400'>
            <p>WhatsApp: {CONTACT_PHONE}</p>
            <p>magicarte.net</p>
            <p className='mt-1'>Precios sujetos a cambios según personalización</p>
          </div>
        </footer>
      </main>
    </div>
  )
}
