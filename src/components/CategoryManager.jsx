import { useState, useRef } from 'react'
import { supabase } from '../config/supabaseClient'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { TABLE } from '../utils/constants'
import toast from 'react-hot-toast'

export default function CategoryManager({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '' })
  const [reordering, setReordering] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const dragItem = useRef(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)

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
          .update({ name: formData.name })
          .eq('id', editingCategory.id)
      } else {
        result = await supabase
          .from('categories')
          .insert([{ name: formData.name, order: categories.length + 1 }])
      }
      if (result.error) {
        toast.error(`Error: ${result.error.message}`)
      } else {
        toast.success(editingCategory ? 'Categoría actualizada' : 'Categoría creada')
        resetForm()
        refetch()
      }
    } catch {
      toast.error('Error al procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({ name: '' })
    setEditingCategory(null)
    setShowForm(false)
  }

  const editCategory = (category) => {
    setFormData({ name: category.name })
    setEditingCategory(category)
    setShowForm(true)
  }

  const deleteCategory = async (id) => {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      toast.error('Error al eliminar la categoría')
    } else {
      toast.success('Categoría eliminada')
      setConfirmDeleteId(null)
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
    const position = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
    setDropTarget({ index, position })
  }

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null)
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

    let insertAt = target.index
    if (from < target.index) {
      insertAt = target.position === 'above' ? target.index - 1 : target.index
    } else {
      insertAt = target.position === 'above' ? target.index : target.index + 1
    }
    reordered.splice(insertAt, 0, moved)

    setReordering(true)
    try {
      const updates = reordered.map((cat, i) => ({ id: cat.id, name: cat.name, order: i + 1 }))
      const { error } = await supabase.from('categories').upsert(updates)
      if (error) toast.error('Error al reordenar: ' + error.message)
      else refetch()
    } catch {
      toast.error('Error al guardar el orden')
    } finally {
      setReordering(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto'>
        <div className='p-6'>

          {/* Header */}
          <div className='flex justify-between items-center mb-6'>
            <div>
              <h2 className='text-xl font-bold text-gray-800'>Gestionar Categorías</h2>
              <p className='text-sm text-gray-400 mt-0.5'>{categories.length} categoría{categories.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={onClose} className='text-gray-400 hover:text-gray-600 transition-colors'>
              <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
              </svg>
            </button>
          </div>

          {/* Form */}
          {showForm ? (
            <form onSubmit={handleSubmit} className='mb-5 p-4 bg-gray-50 rounded-xl border border-gray-100'>
              <h3 className='text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3'>
                {editingCategory ? 'Editar categoría' : 'Nueva categoría'}
              </h3>
              <input
                type='text'
                required
                autoFocus
                value={formData.name}
                onChange={(e) => setFormData({ name: e.target.value })}
                className='w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#51c879] focus:border-transparent text-sm mb-3'
                placeholder='Nombre de la categoría'
              />
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={resetForm}
                  className='px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  disabled={loading}
                  className='flex-1 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50'
                >
                  {loading ? 'Guardando...' : editingCategory ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className='w-full mb-5 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:border-[#51c879] hover:text-[#51c879] transition-colors'
            >
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
              </svg>
              Nueva Categoría
            </button>
          )}

          {/* Categories list */}
          <div>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-sm font-semibold text-gray-600 uppercase tracking-wide'>Categorías</h3>
              {reordering ? (
                <span className='text-xs text-gray-400 animate-pulse'>Guardando orden...</span>
              ) : categories.length > 1 ? (
                <span className='text-xs text-gray-400'>Arrastra para reordenar</span>
              ) : null}
            </div>

            {categories.length === 0 ? (
              <p className='text-gray-400 text-center py-10 text-sm'>No hay categorías todavía</p>
            ) : (
              <div className='space-y-0'>
                {categories.map((category, index) => (
                  <div key={category.id} className='relative'>
                    {dropTarget?.index === index && dropTarget?.position === 'above' && (
                      <div className='absolute -top-px left-0 right-0 h-0.5 bg-[#51c879] rounded-full z-10' />
                    )}

                    <div
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center justify-between px-3 py-3 my-0.5 rounded-xl border transition-all duration-150 cursor-grab active:cursor-grabbing select-none ${
                        dragIndex === index
                          ? 'opacity-30 bg-gray-100 border-gray-200'
                          : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                      }`}
                    >
                      <div className='flex items-center gap-3'>
                        {/* Drag handle */}
                        <svg className='w-4 h-4 text-gray-300 flex-shrink-0' fill='currentColor' viewBox='0 0 20 20'>
                          <path d='M7 2a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zM7 8a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zM7 14a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4z' />
                        </svg>
                        <span className='font-medium text-gray-800 text-sm'>{category.name}</span>
                      </div>

                      {confirmDeleteId === category.id ? (
                        <div className='flex items-center gap-2'>
                          <span className='text-xs text-gray-500'>¿Eliminar?</span>
                          <button
                            onClick={() => deleteCategory(category.id)}
                            className='text-xs bg-red-500 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-red-600 transition-colors'
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className='text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg font-medium hover:bg-gray-200 transition-colors'
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className='flex items-center gap-1'>
                          <button
                            onClick={() => editCategory(category)}
                            className='p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'
                            title='Editar'
                          >
                            <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' />
                            </svg>
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(category.id)}
                            className='p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors'
                            title='Eliminar'
                          >
                            <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {dropTarget?.index === index && dropTarget?.position === 'below' && (
                      <div className='absolute -bottom-px left-0 right-0 h-0.5 bg-[#51c879] rounded-full z-10' />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
