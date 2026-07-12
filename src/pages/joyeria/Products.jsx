import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import AdminLogin from '../../components/AdminLogin'
import CategoryManager from '../../components/CategoryManager'
import { supabase } from '../../config/supabaseClient'
import { useBusiness } from '../../context/BusinessContext'
import { fetchEngravingDetails, upsertEngravingDetails } from '../../data/productDetails'
import {
  createProduct,
  deleteProduct,
  fetchProductsForBusiness,
  setProductVisibility,
  updateProduct,
} from '../../data/products'
import { businessFilter } from '../../data/scope'
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery'
import { getImageUrl } from '../../utils/getImageUrl'
import { uploadCompressedImage } from '../../utils/uploadImage'
import { TABLE } from '../../utils/constants'

const initialForm = {
  name: '',
  price: '',
  description: '',
  category_id: '',
  stock_quantity: 1,
  is_visible: true,
  metal: '',
  item_type: '',
  dimensions: '',
  engraving_area: '',
}

const money = (value) => `C$ ${Number(value || 0).toFixed(0)}`

/** Stocked Joyería products. Bring-your-own engraving jobs stay in Grabados. */
export default function JoyeriaProducts() {
  const { currentBusinessId, currentBusiness } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
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

  useEffect(() => {
    if (user && currentBusinessId) loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusinessId, user])

  const loadProducts = async () => {
    setLoading(true)
    const { data, error } = await fetchProductsForBusiness(currentBusinessId)
    if (error) toast.error(`Error al cargar: ${error.message}`)
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
    const { data: details, error } = await fetchEngravingDetails(product.id)
    if (error) toast.error(`No se pudieron cargar los detalles: ${error.message}`)
    setFormData({
      name: product.name || '',
      price: product.price ?? '',
      description: product.description || '',
      category_id: product.category_id || '',
      stock_quantity: product.stock_quantity ?? 1,
      is_visible: product.is_visible ?? true,
      metal: details?.metal || '',
      item_type: details?.item_type || '',
      dimensions: details?.dimensions || '',
      engraving_area: details?.engraving_area || '',
    })
    setShowForm(true)
  }

  const setField = (name, value) => setFormData((previous) => ({ ...previous, [name]: value }))

  const onImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const save = async (event) => {
    event.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Escribe el nombre del producto')
      return
    }

    setSaving(true)
    try {
      let imageUrl = editingProduct?.image_url || null
      if (imageFile) imageUrl = await uploadCompressedImage(imageFile, 'products')

      const baseProduct = {
        name: formData.name.trim(),
        price: Number(formData.price) || 0,
        description: formData.description.trim() || null,
        category_id: formData.category_id || null,
        stock_quantity: Number(formData.stock_quantity) || 0,
        is_visible: formData.is_visible,
        image_url: imageUrl,
      }

      let productId
      if (editingProduct) {
        const { error } = await updateProduct(editingProduct.id, baseProduct)
        if (error) throw error
        productId = editingProduct.id
      } else {
        const { data, error } = await createProduct(baseProduct, currentBusinessId)
        if (error) throw error
        productId = data[0].id
      }

      const { error: detailsError } = await upsertEngravingDetails(productId, {
        metal: formData.metal.trim() || null,
        item_type: formData.item_type.trim() || null,
        dimensions: formData.dimensions.trim() || null,
        engraving_area: formData.engraving_area.trim() || null,
      })
      if (detailsError) throw detailsError

      toast.success(editingProduct ? 'Producto actualizado' : 'Producto creado')
      resetForm()
      loadProducts()
    } catch (error) {
      toast.error(`Error al guardar: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const toggleVisibility = async (product) => {
    const { error } = await setProductVisibility(product.id, !product.is_visible)
    if (error) toast.error(`Error al actualizar: ${error.message}`)
    else loadProducts()
  }

  const removeProduct = async (id) => {
    const { error } = await deleteProduct(id)
    if (error) toast.error(`Error al eliminar: ${error.message}`)
    else {
      toast.success('Producto eliminado')
      setConfirmDeleteId(null)
      loadProducts()
    }
  }

  if (checkingAuth) return <Loading />
  if (!user) return <AdminLogin onLogin={setUser} />

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='mx-auto max-w-5xl px-4'>
        <div className='mb-5 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-5'>
          <div>
            <h1 className='text-xl font-bold text-gray-800'>Productos de Joyería</h1>
            <p className='mt-0.5 text-xs text-gray-400'>{products.length} producto{products.length !== 1 ? 's' : ''} en {currentBusiness?.name}</p>
          </div>
          <div className='flex gap-2'>
            <button onClick={() => setShowCategories(true)} className='rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50'>Categorías</button>
            <button onClick={openCreate} className='rounded-xl bg-[#B08A3C] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90'>+ Nuevo producto</button>
          </div>
        </div>

        {loading ? (
          <div className='rounded-2xl bg-white p-10 text-center text-sm text-gray-400 shadow-soft'>Cargando...</div>
        ) : products.length === 0 ? (
          <div className='rounded-2xl bg-white p-10 text-center text-sm text-gray-400 shadow-soft'>Aún no hay productos en inventario. Los grabados sobre piezas del cliente se registran en Grabados.</div>
        ) : (
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4'>
            {products.map((product) => (
              <article key={product.id} className='overflow-hidden rounded-2xl bg-white shadow-soft'>
                <div className='aspect-square bg-gray-100'>
                  {product.image_url && <img src={getImageUrl(product.image_url, { width: 300 })} alt={product.name} className='h-full w-full object-cover' />}
                </div>
                <div className='p-3'>
                  <p className='truncate text-sm font-semibold text-gray-800'>{product.name}</p>
                  <p className='text-xs text-gray-400'>{money(product.price)} · {product.stock_quantity || 0} en stock</p>
                  <div className='mt-2 flex items-center gap-1.5'>
                    <button onClick={() => openEdit(product)} className='flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50'>Editar</button>
                    <button onClick={() => toggleVisibility(product)} className={`rounded-lg p-1.5 ${product.is_visible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-300 hover:bg-gray-50'}`} title={product.is_visible ? 'Visible' : 'Oculto'}>◉</button>
                    {confirmDeleteId === product.id ? (
                      <button onClick={() => removeProduct(product.id)} className='rounded-lg bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100'>Sí</button>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(product.id)} className='rounded-lg p-1.5 text-gray-300 hover:bg-gray-50 hover:text-red-500' title='Eliminar'>⌫</button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <CategoryManager isOpen={showCategories} onClose={() => setShowCategories(false)} />

      {showForm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <form onSubmit={save} className='max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl'>
            <div className='flex items-center justify-between border-b border-gray-100 p-5'>
              <h2 className='text-lg font-bold text-gray-800'>{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button type='button' onClick={resetForm} className='text-gray-400 hover:text-gray-600' aria-label='Cerrar'>×</button>
            </div>
            <div className='space-y-4 p-5'>
              <div>
                <label className='mb-1.5 block text-xs font-medium text-gray-600'>Imagen</label>
                <label className='flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100'>
                  {imagePreview || editingProduct?.image_url ? <img src={imagePreview || getImageUrl(editingProduct.image_url, { width: 200 })} alt='' className='h-full w-full rounded-xl object-cover' /> : <span className='text-xs text-gray-400'>Subir imagen</span>}
                  <input type='file' accept='image/*' onChange={onImageChange} className='hidden' />
                </label>
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <Field className='col-span-2' label='Nombre'><input required value={formData.name} onChange={(event) => setField('name', event.target.value)} className='field' /></Field>
                <Field label='Precio (C$)'><input type='number' min='0' step='0.01' value={formData.price} onChange={(event) => setField('price', event.target.value)} className='field' /></Field>
                <Field label='Categoría'><select value={formData.category_id} onChange={(event) => setField('category_id', event.target.value)} className='field'><option value=''>Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                <Field className='col-span-2' label='Descripción'><textarea rows={2} value={formData.description} onChange={(event) => setField('description', event.target.value)} className='field' /></Field>
                <Field label='Stock'><input type='number' min='0' step='1' value={formData.stock_quantity} onChange={(event) => setField('stock_quantity', event.target.value)} className='field' /></Field>
                <label className='flex items-end gap-2 pb-2.5 text-sm text-gray-600'><input type='checkbox' checked={formData.is_visible} onChange={(event) => setField('is_visible', event.target.checked)} />Visible en catálogo</label>
              </div>
              <div className='rounded-xl border border-amber-200 bg-amber-50 p-3'>
                <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800'>Detalles de grabado</p>
                <div className='grid grid-cols-2 gap-3'>
                  <input value={formData.metal} onChange={(event) => setField('metal', event.target.value)} placeholder='Metal / material' className='field' />
                  <input value={formData.item_type} onChange={(event) => setField('item_type', event.target.value)} placeholder='Tipo de pieza' className='field' />
                  <input value={formData.dimensions} onChange={(event) => setField('dimensions', event.target.value)} placeholder='Dimensiones' className='field' />
                  <input value={formData.engraving_area} onChange={(event) => setField('engraving_area', event.target.value)} placeholder='Área de grabado' className='field' />
                </div>
              </div>
            </div>
            <div className='flex gap-3 border-t border-gray-100 p-5'>
              <button type='button' onClick={resetForm} className='rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50'>Cancelar</button>
              <button disabled={saving} className='flex-1 rounded-xl bg-[#B08A3C] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'>{saving ? 'Guardando...' : editingProduct ? 'Actualizar producto' : 'Crear producto'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Field({ label, children, className = '' }) {
  return <label className={className}><span className='mb-1.5 block text-xs font-medium text-gray-600'>{label}</span>{children}</label>
}

function Loading() {
  return <div className='flex min-h-screen items-center justify-center bg-gray-50'><div className='h-12 w-12 animate-spin rounded-full border-b-2 border-[#B08A3C]' /></div>
}
