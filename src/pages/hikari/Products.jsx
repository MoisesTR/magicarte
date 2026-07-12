import { useEffect, useState } from 'react'
import AdminLogin from '../../components/AdminLogin'
import CategoryManager from '../../components/CategoryManager'
import { supabase } from '../../config/supabaseClient'
import { useBusiness } from '../../context/BusinessContext'
import { businessFilter } from '../../data/scope'
import {
  fetchProductsForBusiness,
  createProduct,
  updateProduct,
  setProductVisibility,
  deleteProduct as deleteProductRow,
} from '../../data/products'
import { fetch3dDetails, upsert3dDetails } from '../../data/productDetails'
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery'
import { TABLE } from '../../utils/constants'
import { getImageUrl } from '../../utils/getImageUrl'
import { uploadCompressedImage } from '../../utils/uploadImage'
import toast from 'react-hot-toast'

const initialForm = {
  name: '',
  price: '',
  description: '',
  category_id: '',
  stock_quantity: 1,
  is_visible: true,
  // product_3d_details
  material: '',
  color: '',
  print_hours: '',
  weight_grams: '',
  filament_cost: '',
}

const money = (v) => `C$ ${Number(v || 0).toFixed(0)}`

/** Hikari (3D printing) product catalog — base fields + product_3d_details. */
export default function HikariProducts() {
  const { currentBusinessId, currentBusiness } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const { data: categories = [] } = useSupabaseQuery(TABLE.CATEGORIES, {
    filters: businessFilter(currentBusinessId),
    order: { column: 'order' },
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser)
      setCheckingAuth(false)
    })
  }, [])

  // Fetch only once we know the user AND the real business id; refetch on switch.
  useEffect(() => {
    if (user && currentBusinessId) fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, user])

  const fetchProducts = async () => {
    setLoading(true)
    const { data, error } = await fetchProductsForBusiness(currentBusinessId)
    if (error) toast.error('Error al cargar: ' + error.message)
    else setProducts(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingProduct(null)
    setFormData(initialForm)
    setImageFile(null)
    setImagePreview(null)
  }

  const openCreate = () => {
    setEditingProduct(null)
    setFormData(initialForm)
    setImageFile(null)
    setImagePreview(null)
    setShowForm(true)
  }

  const openEdit = async (product) => {
    setEditingProduct(product)
    setImageFile(null)
    setImagePreview(null)
    const { data: details } = await fetch3dDetails(product.id)
    setFormData({
      name: product.name || '',
      price: product.price ?? '',
      description: product.description || '',
      category_id: product.category_id || '',
      stock_quantity: product.stock_quantity ?? 1,
      is_visible: product.is_visible ?? true,
      material: details?.material || '',
      color: details?.color || '',
      print_hours: details?.print_hours ?? '',
      weight_grams: details?.weight_grams ?? '',
      filament_cost: details?.filament_cost ?? '',
    })
    setShowForm(true)
  }

  const onImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Escribe el nombre del producto')
      return
    }
    setSaving(true)
    try {
      let imageUrl = editingProduct?.image_url || null
      if (imageFile) imageUrl = await uploadCompressedImage(imageFile, 'products')

      const productData = {
        name: formData.name.trim(),
        price: Number(formData.price) || 0,
        description: formData.description || null,
        category_id: formData.category_id || null,
        stock_quantity: Number(formData.stock_quantity) || 0,
        is_visible: formData.is_visible,
        image_url: imageUrl,
      }

      let productId
      if (editingProduct) {
        const { error } = await updateProduct(editingProduct.id, productData)
        if (error) throw error
        productId = editingProduct.id
      } else {
        const { data, error } = await createProduct(productData, currentBusinessId)
        if (error) throw error
        productId = data[0].id
      }

      const { error: detailsErr } = await upsert3dDetails(productId, {
        material: formData.material || null,
        color: formData.color || null,
        print_hours: formData.print_hours === '' ? null : Number(formData.print_hours),
        weight_grams: formData.weight_grams === '' ? null : Number(formData.weight_grams),
        filament_cost: formData.filament_cost === '' ? null : Number(formData.filament_cost),
      })
      if (detailsErr) throw detailsErr

      toast.success(editingProduct ? 'Producto actualizado' : 'Producto creado')
      resetForm()
      fetchProducts()
    } catch (err) {
      toast.error('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleVisibility = async (product) => {
    const { error } = await setProductVisibility(product.id, !product.is_visible)
    if (error) toast.error('Error al actualizar visibilidad')
    else fetchProducts()
  }

  const handleDelete = async (id) => {
    const { error } = await deleteProductRow(id)
    if (error) toast.error('Error al eliminar: ' + error.message)
    else {
      toast.success('Producto eliminado')
      setConfirmDeleteId(null)
      fetchProducts()
    }
  }

  if (checkingAuth) {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37] mx-auto'></div>
      </div>
    )
  }
  if (!user) return <AdminLogin onLogin={(u) => setUser(u)} />

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='max-w-5xl mx-auto px-4'>
        <div className='bg-white rounded-2xl shadow-soft p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold text-gray-800'>Productos de impresión 3D</h1>
            <p className='text-xs text-gray-400 mt-0.5'>
              {products.length} producto{products.length !== 1 ? 's' : ''} · {currentBusiness?.name}
            </p>
          </div>
          <div className='flex gap-2'>
            <button onClick={() => setShowCategories(true)} className='rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50'>
              Categorías
            </button>
            <button
              onClick={openCreate}
              className='rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90'
              style={{ backgroundColor: '#D4AF37' }}
            >
              + Nuevo producto
            </button>
          </div>
        </div>

        {loading ? (
          <div className='bg-white rounded-2xl shadow-soft p-10 text-center text-gray-400 text-sm'>Cargando...</div>
        ) : products.length === 0 ? (
          <div className='bg-white rounded-2xl shadow-soft p-10 text-center text-gray-400 text-sm'>
            Aún no hay productos. Crea el primero arriba.
          </div>
        ) : (
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4'>
            {products.map((p) => (
              <div key={p.id} className='bg-white rounded-2xl shadow-soft overflow-hidden'>
                <div className='aspect-square bg-gray-100'>
                  {p.image_url && (
                    <img src={getImageUrl(p.image_url, { width: 300 })} alt={p.name} className='h-full w-full object-cover' />
                  )}
                </div>
                <div className='p-3'>
                  <p className='truncate text-sm font-semibold text-gray-800'>{p.name}</p>
                  <p className='text-xs text-gray-400'>{money(p.price)}</p>
                  <div className='mt-2 flex items-center gap-1.5'>
                    <button onClick={() => openEdit(p)} className='flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50'>
                      Editar
                    </button>
                    <button
                      onClick={() => toggleVisibility(p)}
                      className={`rounded-lg p-1.5 ${p.is_visible ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-50'}`}
                      title={p.is_visible ? 'Visible' : 'Oculto'}
                    >
                      <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' />
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' />
                      </svg>
                    </button>
                    {confirmDeleteId === p.id ? (
                      <button onClick={() => handleDelete(p.id)} className='rounded-lg bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100'>
                        Sí
                      </button>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(p.id)} className='rounded-lg p-1.5 text-gray-300 hover:bg-gray-50 hover:text-red-500'>
                        <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <form onSubmit={handleSave} className='w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl'>
            <div className='flex items-center justify-between border-b border-gray-100 p-5'>
              <h2 className='text-lg font-bold text-gray-800'>{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button type='button' onClick={resetForm} className='text-gray-400 hover:text-gray-600'>
                <svg className='h-6 w-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                </svg>
              </button>
            </div>

            <div className='space-y-4 p-5'>
              <div>
                <label className='mb-1.5 block text-xs font-medium text-gray-600'>Imagen</label>
                <label className='flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100'>
                  {imagePreview || editingProduct?.image_url ? (
                    <img
                      src={imagePreview || getImageUrl(editingProduct.image_url, { width: 200 })}
                      alt=''
                      className='h-full w-full rounded-xl object-cover'
                    />
                  ) : (
                    <span className='text-xs text-gray-400'>Subir imagen</span>
                  )}
                  <input type='file' accept='image/*' onChange={onImageChange} className='hidden' />
                </label>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='col-span-2'>
                  <label className='mb-1.5 block text-xs font-medium text-gray-600'>Nombre</label>
                  <input
                    type='text'
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#D4AF37]'
                  />
                </div>
                <div>
                  <label className='mb-1.5 block text-xs font-medium text-gray-600'>Precio (C$)</label>
                  <input
                    type='number' step='0.01' min='0'
                    value={formData.price}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                    className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#D4AF37]'
                  />
                </div>
                <div>
                  <label className='mb-1.5 block text-xs font-medium text-gray-600'>Categoría</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData((p) => ({ ...p, category_id: e.target.value }))}
                    className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#D4AF37]'
                  >
                    <option value=''>Sin categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className='col-span-2'>
                  <label className='mb-1.5 block text-xs font-medium text-gray-600'>Descripción</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    rows={2}
                    className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#D4AF37]'
                  />
                </div>
                <div>
                  <label className='mb-1.5 block text-xs font-medium text-gray-600'>Stock</label>
                  <input
                    type='number' step='1' min='0'
                    value={formData.stock_quantity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData((p) => ({ ...p, stock_quantity: e.target.value }))}
                    className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#D4AF37]'
                  />
                </div>
                <div className='flex items-end pb-2.5'>
                  <label className='flex items-center gap-2 text-sm text-gray-600'>
                    <input
                      type='checkbox'
                      checked={formData.is_visible}
                      onChange={(e) => setFormData((p) => ({ ...p, is_visible: e.target.checked }))}
                      className='h-4 w-4 rounded border-gray-300'
                    />
                    Visible en catálogo
                  </label>
                </div>
              </div>

              <div className='rounded-xl border border-gray-200 p-3'>
                <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400'>Detalles de impresión</p>
                <div className='grid grid-cols-2 gap-3'>
                  <input
                    type='text'
                    value={formData.material}
                    onChange={(e) => setFormData((p) => ({ ...p, material: e.target.value }))}
                    placeholder='Material (PLA, PETG...)'
                    className='rounded-lg border border-gray-200 px-2.5 py-2 text-sm'
                  />
                  <input
                    type='text'
                    value={formData.color}
                    onChange={(e) => setFormData((p) => ({ ...p, color: e.target.value }))}
                    placeholder='Color'
                    className='rounded-lg border border-gray-200 px-2.5 py-2 text-sm'
                  />
                  <input
                    type='number' step='0.5' min='0'
                    value={formData.print_hours}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData((p) => ({ ...p, print_hours: e.target.value }))}
                    placeholder='Horas de impresión'
                    className='rounded-lg border border-gray-200 px-2.5 py-2 text-sm'
                  />
                  <input
                    type='number' step='1' min='0'
                    value={formData.weight_grams}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData((p) => ({ ...p, weight_grams: e.target.value }))}
                    placeholder='Peso (gramos)'
                    className='rounded-lg border border-gray-200 px-2.5 py-2 text-sm'
                  />
                  <input
                    type='number' step='0.01' min='0'
                    value={formData.filament_cost}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData((p) => ({ ...p, filament_cost: e.target.value }))}
                    placeholder='Costo de filamento (C$)'
                    className='col-span-2 rounded-lg border border-gray-200 px-2.5 py-2 text-sm'
                  />
                </div>
              </div>
            </div>

            <div className='flex gap-3 border-t border-gray-100 p-5'>
              <button type='button' onClick={resetForm} className='rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50'>
                Cancelar
              </button>
              <button
                type='submit'
                disabled={saving}
                className='flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
                style={{ backgroundColor: '#D4AF37' }}
              >
                {saving ? 'Guardando...' : editingProduct ? 'Actualizar producto' : 'Crear producto'}
              </button>
            </div>
          </form>
        </div>
      )}
      <CategoryManager isOpen={showCategories} onClose={() => setShowCategories(false)} />
    </div>
  )
}
