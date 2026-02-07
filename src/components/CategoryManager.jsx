import { useState, useRef } from 'react'
import { supabase } from '../config/supabaseClient'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { TABLE } from '../utils/constants'

export default function CategoryManager({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formData, setFormData] = useState({ name: '', order: 1 })
  const [reordering, setReordering] = useState(false)

  const dragItem = useRef(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // { index, position: 'above' | 'below' }

  const { data: categories = [], refetch } = useSupabaseQuery(TABLE.CATEGORIES, {
    order: { column: 'order' }
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      let result
      if (editingCategory) {
        result = await supabase
          .from('categories')
          .update({ name: formData.name, order: parseInt(formData.order) })
          .eq('id', editingCategory.id)
      } else {
        result = await supabase
          .from('categories')
          .insert([{ name: formData.name, order: parseInt(formData.order) }])
      }
      if (result.error) {
        alert(`Error: ${result.error.message}`)
      } else {
        alert(editingCategory ? 'Categoría actualizada' : 'Categoría creada')
        resetForm()
        refetch()
      }
    } catch (error) {
      alert('Error al procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({ name: '', order: 1 })
    setEditingCategory(null)
  }

  const editCategory = (category) => {
    setFormData({ name: category.name, order: category.order })
    setEditingCategory(category)
  }

  const deleteCategory = async (id) => {
    if (!confirm('¿Estás seguro de eliminar esta categoría?')) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      alert('Error al eliminar la categoría')
    } else {
      alert('Categoría eliminada')
      refetch()
    }
  }

  const handleDragStart = (index) => {
    dragItem.current = index
    setDragIndex(index)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (dragItem.current === null || dragItem.current === index) {
      setDropTarget(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position = e.clientY < midY ? 'above' : 'below'
    setDropTarget({ index, position })
  }

  const handleDragLeave = (e) => {
    // Only clear if actually leaving the element (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTarget(null)
    }
  }

  const handleDragEnd = async () => {
    const from = dragItem.current
    const target = dropTarget

    setDragIndex(null)
    setDropTarget(null)
    dragItem.current = null

    if (from === null || !target || from === target.index) return

    const reordered = [...categories]
    const [moved] = reordered.splice(from, 1)

    // Calculate insert position
    let insertAt = target.index
    if (from < target.index) {
      insertAt = target.position === 'above' ? target.index - 1 : target.index
    } else {
      insertAt = target.position === 'above' ? target.index : target.index + 1
    }
    reordered.splice(insertAt, 0, moved)

    setReordering(true)
    try {
      const updates = reordered.map((cat, i) => ({
        id: cat.id,
        name: cat.name,
        order: i + 1,
      }))
      const { error } = await supabase.from('categories').upsert(updates)
      if (error) {
        alert('Error al reordenar: ' + error.message)
      } else {
        refetch()
      }
    } catch (err) {
      alert('Error al guardar el orden')
    } finally {
      setReordering(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto'>
        <div className='p-6'>
          {/* Header */}
          <div className='flex justify-between items-center mb-6'>
            <h2 className='text-2xl font-bold text-gray-800'>Gestionar Categorías</h2>
            <button onClick={onClose} className='text-gray-500 hover:text-gray-700 text-2xl'>×</button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className='mb-6 p-4 bg-gray-50 rounded-xl'>
            <h3 className='text-lg font-semibold mb-4'>
              {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
            </h3>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Nombre de la Categoría *
                </label>
                <input
                  type='text'
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                  placeholder='Ej: Decoraciones'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Orden de Aparición
                </label>
                <input
                  type='number'
                  min='1'
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: e.target.value })}
                  className='w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent'
                />
              </div>
            </div>
            <div className='flex space-x-3 mt-4'>
              {editingCategory && (
                <button
                  type='button'
                  onClick={resetForm}
                  className='px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors'
                >
                  Cancelar
                </button>
              )}
              <button
                type='submit'
                disabled={loading}
                className='flex-1 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-6 py-2 rounded-xl font-semibold hover:from-[#45b86b] hover:to-[#42a8d1] transition-all duration-200 disabled:opacity-50'
              >
                {loading ? 'Guardando...' : editingCategory ? 'Actualizar' : 'Crear Categoría'}
              </button>
            </div>
          </form>

          {/* Categories List */}
          <div>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-lg font-semibold'>Categorías Existentes</h3>
              {reordering ? (
                <span className='text-sm text-gray-500 animate-pulse'>Guardando orden...</span>
              ) : categories.length > 1 ? (
                <span className='text-sm text-gray-400'>Arrastra para reordenar</span>
              ) : null}
            </div>

            {categories.length === 0 ? (
              <p className='text-gray-500 text-center py-8'>No hay categorías creadas aún</p>
            ) : (
              <div className='space-y-0'>
                {categories.map((category, index) => (
                  <div key={category.id} className='relative'>
                    {/* Drop indicator line - above */}
                    {dropTarget?.index === index && dropTarget?.position === 'above' && (
                      <div className='absolute -top-[2px] left-0 right-0 h-[3px] bg-[#51c879] rounded-full z-10 shadow-sm shadow-green-300' />
                    )}

                    <div
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center justify-between p-4 my-1 rounded-xl border transition-all duration-150 cursor-grab active:cursor-grabbing ${
                        dragIndex === index
                          ? 'opacity-30 scale-[0.98] bg-gray-100'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className='flex items-center gap-3'>
                        <span className='text-gray-400 text-lg select-none'>⠿</span>
                        <div>
                          <h4 className='font-semibold text-gray-800'>{category.name}</h4>
                          <p className='text-sm text-gray-500'>Orden: {category.order ?? '—'}</p>
                        </div>
                      </div>
                      <div className='flex space-x-2'>
                        <button
                          onClick={() => editCategory(category)}
                          className='bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition-colors text-sm'
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => deleteCategory(category.id)}
                          className='bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 transition-colors text-sm'
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>

                    {/* Drop indicator line - below */}
                    {dropTarget?.index === index && dropTarget?.position === 'below' && (
                      <div className='absolute -bottom-[2px] left-0 right-0 h-[3px] bg-[#51c879] rounded-full z-10 shadow-sm shadow-green-300' />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Close Button */}
          <div className='mt-6 pt-4 border-t'>
            <button
              onClick={onClose}
              className='w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium'
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
