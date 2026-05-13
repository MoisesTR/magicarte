import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset() {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='min-h-screen bg-gray-50 flex items-center justify-center p-6'>
          <div className='bg-white rounded-2xl shadow-soft max-w-md w-full p-8 text-center'>
            <div className='w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4'>
              <svg className='w-7 h-7 text-red-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' />
              </svg>
            </div>
            <h2 className='text-lg font-bold text-gray-800 mb-2'>Algo salió mal</h2>
            <p className='text-sm text-gray-500 mb-6'>
              Ocurrió un error inesperado. Puedes intentar recargar la página.
            </p>
            <div className='flex gap-3 justify-center'>
              <button
                onClick={() => window.location.reload()}
                className='px-5 py-2.5 bg-gradient-to-r from-[#51c879] to-[#50bfe6] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity'
              >
                Recargar página
              </button>
              <button
                onClick={() => this.handleReset()}
                className='px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors'
              >
                Intentar de nuevo
              </button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <pre className='mt-6 text-left text-xs bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-auto text-red-600 max-h-40'>
                {this.state.error.toString()}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
