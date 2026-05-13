import { Toaster } from 'react-hot-toast'
import ReactGA from 'react-ga4'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ErrorBoundary from './components/ErrorBoundary'

const Home = lazy(() => import('./pages/Home'))
const Products = lazy(() => import('./pages/Products'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const Admin = lazy(() => import('./pages/Admin'))
const Orders = lazy(() => import('./pages/Orders'))

if (import.meta.env.VITE_GA_ENABLED === 'true') {
  ReactGA.initialize(import.meta.env.VITE_GA_MEASUREMENT_ID)
}

const queryClient = new QueryClient()

export default function App() {

  useEffect(() => {
    ReactGA.send('pageview')
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools initialIsOpen={false} />
      <Toaster position='top-right' toastOptions={{ duration: 3000, style: { borderRadius: '12px', padding: '12px 16px' } }} />
        <Router>
          <Suspense fallback={<div className='min-h-screen bg-gray-50 flex items-center justify-center text-gray-600'>Cargando...</div>}>
            <ErrorBoundary>
              <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/products' element={<Products />} />
                <Route path='/product/:id' element={<ProductDetail />} />
                <Route path='/admin' element={<Admin />} />
                <Route path='/admin/orders' element={<Orders />} />
              </Routes>
            </ErrorBoundary>
          </Suspense>
        </Router>
    </QueryClientProvider>
  )
}
