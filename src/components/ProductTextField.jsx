import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { createEnhancementState, enhancementReducer, requestTextEnhancement } from '../utils/productTextEnhance.js'

export default function ProductTextField({ field, label, value, onChange, context, getSession, rows = 3, required = false, placeholder }) {
  const [state, setState] = useState(() => createEnhancementState(value))
  const stateRef = useRef(state)
  const mounted = useRef(false)
  const sequence = useRef(0)
  const id = `product-text-${field}`

  // Advance the ref synchronously as well, so two quick clicks cannot start two requests.
  const advance = useCallback(action => {
    const next = enhancementReducer(stateRef.current, action)
    stateRef.current = next
    setState(next)
    return next
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (stateRef.current.text !== value) advance({ type: 'edit', text: value })
  }, [value, advance])

  const enhance = async () => {
    if (stateRef.current.pending || !stateRef.current.text.trim()) return
    const requestId = ++sequence.current
    const started = advance({ type: 'start', id: requestId })
    try {
      const result = await requestTextEnhancement({ ...context, field, text: started.text }, { getSession })
      if (mounted.current) advance({ type: 'suggest', id: requestId, text: result.text })
    } catch (error) {
      if (!mounted.current) return
      // An edit also makes any error for that older text irrelevant.
      const pending = stateRef.current.pending
      if (pending?.id === requestId && pending.revision === stateRef.current.revision) toast.error(error.message)
      advance({ type: 'fail', id: requestId })
    }
  }

  const changeText = (type, text) => {
    const next = advance({ type, text })
    onChange(next.text)
  }

  return (
    <div className='min-w-0'>
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
        <label htmlFor={id} className='min-w-0 text-sm font-medium text-gray-700'>{label}</label>
        <button
          type='button'
          onClick={enhance}
          disabled={!state.text.trim() || !!state.pending}
          aria-label={`Mejorar con IA: ${label}`}
          aria-busy={!!state.pending}
          className='min-h-10 min-w-10 shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {state.pending ? 'Mejorando…' : '✨ Mejorar'}
        </button>
      </div>
      <textarea
        id={id}
        required={required}
        rows={rows}
        value={value}
        onChange={event => changeText('edit', event.target.value)}
        aria-describedby={state.suggestion ? `${id}-suggestion` : undefined}
        className='w-full min-w-0 resize-y rounded-xl border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-[#51c879]'
        placeholder={placeholder}
      />
      {state.suggestion && (
        <div id={`${id}-suggestion`} role='status' className='mt-2 min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-gray-700'>
          <p className='mb-2 font-medium text-emerald-800'>Sugerencia de IA · revise antes de usar</p>
          <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>{state.suggestion}</p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <button type='button' onClick={() => changeText('use')} className='min-h-10 min-w-10 rounded-lg bg-emerald-700 px-3 py-2 font-medium text-white hover:bg-emerald-800'>Usar este texto</button>
            <button type='button' onClick={() => advance({ type: 'discard' })} className='min-h-10 min-w-10 rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-emerald-100'>Descartar</button>
          </div>
        </div>
      )}
      {state.undo && (
        <button type='button' onClick={() => changeText('undo')} className='mt-1 min-h-10 min-w-10 rounded-lg px-2 py-2 text-sm font-medium text-emerald-700 underline hover:bg-emerald-50'>Deshacer</button>
      )}
    </div>
  )
}
