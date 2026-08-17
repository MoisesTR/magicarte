import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import AdminLogin from '../components/AdminLogin'
import { supabase } from '../config/supabaseClient'
import { useBusiness } from '../context/BusinessContext'
import { createNote, deleteNote, fetchBusinessNotes, updateNote } from '../data/notes'
import { fetchProductsForBusiness } from '../data/products'

const CATEGORIES = {
  idea: { label: 'Idea', tone: 'amber' },
  todo: { label: 'Pendiente', tone: 'blue' },
  task: { label: 'Tarea', tone: 'teal' },
  in_progress: { label: 'En progreso', tone: 'purple' },
  remove: { label: 'Por quitar', tone: 'red' },
  general: { label: 'General', tone: 'gray' },
}

const PRIORITIES = {
  low: { label: 'Baja', tone: 'gray' },
  normal: { label: 'Normal', tone: 'blue' },
  high: { label: 'Alta', tone: 'red' },
}
const PRIORITY_WEIGHT = { high: 0, normal: 1, low: 2 }

const ASSIGNEES = ['Moisés', 'Ivonne']

const FILTERS = [['all', 'Todas'], ...Object.entries(CATEGORIES).map(([value, c]) => [value, c.label])]

const noteFormInitial = { title: '', body: '', category: 'idea', priority: 'normal', product_id: '', assigned_to: '' }

function sortNotes(list) {
  return [...list].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    const priorityDiff = (PRIORITY_WEIGHT[a.priority] ?? 1) - (PRIORITY_WEIGHT[b.priority] ?? 1)
    if (priorityDiff !== 0) return priorityDiff
    return new Date(b.updated_at) - new Date(a.updated_at)
  })
}

const formatDate = (value) =>
  new Date(value).toLocaleDateString('es-NI', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Notes() {
  const { currentBusiness, currentBusinessId } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [notes, setNotes] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState(noteFormInitial)
  const [filter, setFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser)
      setCheckingAuth(false)
    })
  }, [])

  useEffect(() => {
    setShowForm(false)
    setEditingNote(null)
    setForm(noteFormInitial)
    setDeleteTarget(null)
    setFilter('all')
    setProductFilter('all')
    setAssigneeFilter('all')
    setSearch('')
    if (user && currentBusinessId) loadNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentBusinessId])

  const loadNotes = async () => {
    setLoading(true)
    const [notesResult, productsResult] = await Promise.all([
      fetchBusinessNotes(currentBusinessId),
      fetchProductsForBusiness(currentBusinessId),
    ])
    if (notesResult.error) toast.error(`No se pudieron cargar las notas: ${notesResult.error.message}`)
    else setNotes(sortNotes(notesResult.data || []))
    if (productsResult.error) toast.error(`No se pudieron cargar los productos: ${productsResult.error.message}`)
    else setProducts(productsResult.data || [])
    setLoading(false)
  }

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])

  const counts = useMemo(() => {
    const byCategory = {}
    notes.forEach((note) => { byCategory[note.category] = (byCategory[note.category] || 0) + 1 })
    return byCategory
  }, [notes])

  const visibleNotes = useMemo(() => {
    const term = search.trim().toLowerCase()
    return notes.filter((note) => {
      if (filter !== 'all' && note.category !== filter) return false
      if (productFilter !== 'all' && note.product_id !== productFilter) return false
      if (assigneeFilter !== 'all' && note.assigned_to !== assigneeFilter) return false
      if (!term) return true
      return note.title.toLowerCase().includes(term) || (note.body || '').toLowerCase().includes(term)
    })
  }, [notes, filter, productFilter, assigneeFilter, search])

  const resetForm = () => {
    setShowForm(false)
    setEditingNote(null)
    setForm(noteFormInitial)
  }

  const openCreate = () => {
    setEditingNote(null)
    setForm(noteFormInitial)
    setShowForm(true)
  }

  const openEdit = (note) => {
    setEditingNote(note)
    setForm({
      title: note.title,
      body: note.body || '',
      category: note.category,
      priority: note.priority || 'normal',
      product_id: note.product_id || '',
      assigned_to: note.assigned_to || '',
    })
    setShowForm(true)
  }

  const togglePin = async (note) => {
    const { error } = await updateNote(note.id, { is_pinned: !note.is_pinned }, currentBusinessId)
    if (error) {
      toast.error(`No se pudo actualizar: ${error.message}`)
      return
    }
    setNotes((current) => sortNotes(current.map((n) => (n.id === note.id ? { ...n, is_pinned: !n.is_pinned } : n))))
  }

  const saveNote = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) {
      toast.error('Escribe un título para la nota')
      return
    }

    setSaving(true)
    try {
      const note = {
        title: form.title.trim(),
        body: form.body.trim() || null,
        category: form.category,
        priority: form.priority,
        product_id: form.product_id || null,
        assigned_to: form.assigned_to || null,
      }
      if (editingNote) {
        const { error } = await updateNote(editingNote.id, note, currentBusinessId)
        if (error) throw error
        toast.success('Nota actualizada')
      } else {
        const { error } = await createNote(note, currentBusinessId)
        if (error) throw error
        toast.success('Nota agregada')
      }
      resetForm()
      loadNotes()
    } catch (error) {
      toast.error(`No se pudo guardar la nota: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const removeNote = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const { error } = await deleteNote(deleteTarget.id, currentBusinessId)
      if (error) throw error
      setNotes((current) => current.filter((note) => note.id !== deleteTarget.id))
      toast.success('Nota eliminada')
      setDeleteTarget(null)
    } catch (error) {
      toast.error(`No se pudo eliminar la nota: ${error.message}`)
    } finally {
      setDeleting(false)
    }
  }

  if (checkingAuth) return <Loading />
  if (!user) return <AdminLogin onLogin={(authenticatedUser) => setUser(authenticatedUser)} />
  if (!currentBusinessId) return <Loading />

  const accent = currentBusiness?.primary_color || '#B08A3C'

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='mx-auto max-w-5xl px-4'>
        <div className='admin-page-header mb-5 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-gray-400'>{currentBusiness?.name}</p>
            <h1 className='text-xl font-bold text-gray-800'>Notas</h1>
            <p className='mt-0.5 text-sm text-gray-500'>Ideas, pendientes y recordatorios internos de este negocio.</p>
          </div>
          <button onClick={openCreate} className='rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90' style={{ backgroundColor: accent }}>
            + Nueva nota
          </button>
        </div>

        <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex flex-wrap gap-2'>
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === value ? 'text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}
                style={filter === value ? { backgroundColor: accent } : undefined}
              >
                {label}{value !== 'all' && counts[value] ? ` (${counts[value]})` : ''}
              </button>
            ))}
          </div>
          <div className='flex flex-wrap gap-2 sm:justify-end'>
            {products.length > 0 && (
              <select
                value={productFilter}
                onChange={(event) => setProductFilter(event.target.value)}
                className='rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none'
              >
                <option value='all'>Todos los productos</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            )}
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              className='rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none'
            >
              <option value='all'>Todos los asignados</option>
              {ASSIGNEES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <input
              type='search'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Buscar en las notas...'
              className='w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none sm:w-64'
            />
          </div>
        </div>

        {loading ? (
          <Panel>Cargando notas...</Panel>
        ) : visibleNotes.length === 0 ? (
          <Panel>
            {notes.length === 0
              ? 'Aún no hay notas. Agrega ideas, pendientes o recordatorios para este negocio.'
              : 'Ninguna nota coincide con este filtro o búsqueda.'}
          </Panel>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2'>
            {visibleNotes.map((note) => (
              <article key={note.id} className='flex flex-col rounded-2xl bg-white p-4 shadow-soft'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge tone={CATEGORIES[note.category]?.tone}>{CATEGORIES[note.category]?.label}</Badge>
                    {note.priority !== 'normal' && (
                      <Badge tone={PRIORITIES[note.priority]?.tone}>{PRIORITIES[note.priority]?.label}</Badge>
                    )}
                    {note.product_id && productById.get(note.product_id) && (
                      <span className='rounded-full bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500'>
                        {productById.get(note.product_id).name}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => togglePin(note)}
                    aria-label={note.is_pinned ? 'Quitar de fijadas' : 'Fijar nota'}
                    aria-pressed={note.is_pinned}
                    className={`rounded-lg p-1 text-lg leading-none transition-colors ${note.is_pinned ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'}`}
                  >
                    ★
                  </button>
                </div>
                <h2 className='mt-2 font-bold text-gray-800'>{note.title}</h2>
                {note.body && <p className='mt-1.5 flex-1 whitespace-pre-wrap text-sm text-gray-600'>{note.body}</p>}
                <div className='mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3'>
                  <div className='flex items-center gap-2'>
                    <p className='text-xs text-gray-400'>{formatDate(note.updated_at)}</p>
                    {note.assigned_to && (
                      <span className='rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700'>{note.assigned_to}</span>
                    )}
                  </div>
                  <div className='flex gap-2'>
                    <button onClick={() => openEdit(note)} className='rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50'>Editar</button>
                    <button onClick={() => setDeleteTarget(note)} className='rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50'>Eliminar</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editingNote ? 'Editar nota' : 'Nueva nota'} onClose={resetForm}>
          <form onSubmit={saveNote} className='space-y-4'>
            <div>
              <label className='mb-1 block text-sm font-semibold text-gray-700'>Título</label>
              <input
                autoFocus
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder='Ej. Agregar filtro por color en Productos'
                className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none'
              />
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div>
                <label className='mb-1 block text-sm font-semibold text-gray-700'>Categoría</label>
                <select
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none'
                >
                  {Object.entries(CATEGORIES).map(([value, c]) => (
                    <option key={value} value={value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1 block text-sm font-semibold text-gray-700'>Prioridad</label>
                <select
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none'
                >
                  {Object.entries(PRIORITIES).map(([value, p]) => (
                    <option key={value} value={value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className='mb-1 block text-sm font-semibold text-gray-700'>Asignado a (opcional)</label>
              <select
                value={form.assigned_to}
                onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}
                className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none'
              >
                <option value=''>— Sin asignar —</option>
                {ASSIGNEES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            {products.length > 0 && (
              <div>
                <label className='mb-1 block text-sm font-semibold text-gray-700'>Producto (opcional)</label>
                <select
                  value={form.product_id}
                  onChange={(event) => setForm({ ...form, product_id: event.target.value })}
                  className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none'
                >
                  <option value=''>— Ninguno —</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className='mb-1 block text-sm font-semibold text-gray-700'>Detalle (opcional)</label>
              <textarea
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                rows={5}
                placeholder='Explica la idea, por qué importa o qué falta...'
                className='w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none'
              />
            </div>
            <FormActions onCancel={resetForm} saving={saving} label={editingNote ? 'Guardar cambios' : 'Agregar nota'} color={accent} />
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title='Eliminar nota' onClose={() => setDeleteTarget(null)}>
          <p className='text-sm text-gray-600'>¿Eliminar la nota <strong>{deleteTarget.title}</strong>? Esta acción no se puede deshacer.</p>
          <div className='admin-modal-footer -mx-5 -mb-5 mt-5 flex flex-col-reverse gap-3 border-t border-gray-100 bg-white p-5 sm:flex-row'>
            <button type='button' disabled={deleting} onClick={() => setDeleteTarget(null)} className='w-full rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:w-auto'>Cancelar</button>
            <button onClick={removeNote} disabled={deleting} className='w-full rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 sm:flex-1'>{deleting ? 'Eliminando...' : 'Eliminar'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className='admin-modal-backdrop'>
      <div role='dialog' aria-modal='true' aria-labelledby='notes-modal-title' className='admin-modal-panel max-w-lg bg-white'>
        <div className='admin-modal-header flex items-center justify-between border-b border-gray-100 p-5'><h2 id='notes-modal-title' className='text-lg font-bold text-gray-800'>{title}</h2><button type='button' onClick={onClose} className='rounded-lg p-1 text-2xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-600' aria-label='Cerrar'>×</button></div>
        <div className='admin-modal-body p-5'>{children}</div>
      </div>
    </div>
  )
}

function FormActions({ onCancel, saving, label, color }) {
  return <div className='admin-modal-footer -mx-5 -mb-5 flex flex-col-reverse gap-3 border-t border-gray-100 bg-white p-5 sm:flex-row'><button type='button' disabled={saving} onClick={onCancel} className='w-full rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:w-auto'>Cancelar</button><button disabled={saving} className='w-full rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:flex-1' style={{ backgroundColor: color || '#B08A3C' }}>{saving ? 'Guardando...' : label}</button></div>
}

function Panel({ children }) {
  return <div className='rounded-2xl bg-white p-10 text-center text-sm text-gray-400 shadow-soft'>{children}</div>
}

function Badge({ tone, children }) {
  const colors = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    teal: 'bg-teal-50 text-teal-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-100 text-gray-500',
  }
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[tone] || colors.gray}`}>{children}</span>
}

function Loading() {
  return <div className='flex min-h-screen items-center justify-center bg-gray-50'><div className='h-12 w-12 animate-spin rounded-full border-b-2 border-[#B08A3C]' /></div>
}
