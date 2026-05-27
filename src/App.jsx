import { Toaster } from 'react-hot-toast'
import { BrowserRouter as Router, Navigate, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ErrorBoundary from './components/ErrorBoundary'
import { initializeGoogleAnalytics, trackPageView } from './utils/analytics'

const Home = lazy(() => import('./pages/Home'))
const Products = lazy(() => import('./pages/Products'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const Admin = lazy(() => import('./pages/Admin'))
const Orders = lazy(() => import('./pages/Orders'))
const Catalog = lazy(() => import('./pages/Catalog'))
const Clients = lazy(() => import('./pages/Clients'))
const ShippingPolicy = lazy(() => import('./pages/ShippingPolicy'))
const FAQ = lazy(() => import('./pages/FAQ'))

initializeGoogleAnalytics()

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function AnalyticsPageTracker() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    trackPageView(`${pathname}${search}`)
  }, [pathname, search])

  return null
}

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      <Toaster position='top-right' toastOptions={{ duration: 3000, style: { borderRadius: '12px', padding: '12px 16px' } }} />
        <Router>
          <ScrollToTop />
          <AnalyticsPageTracker />
          <Suspense fallback={<div className='min-h-screen bg-gray-50 flex items-center justify-center text-gray-600'>Cargando...</div>}>
            <ErrorBoundary>
              <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/products' element={<Products />} />
                <Route path='/product/:id' element={<ProductDetail />} />
                <Route path='/admin' element={<Navigate to='/admin/orders' replace />} />
                <Route path='/admin/products' element={<Admin />} />
                <Route path='/admin/orders' element={<Orders />} />
                <Route path='/admin/catalog' element={<Catalog />} />
                <Route path='/admin/clients' element={<Clients />} />
                <Route path='/politica-de-envio' element={<ShippingPolicy />} />
                <Route path='/faq' element={<FAQ />} />
              </Routes>
            </ErrorBoundary>
          </Suspense>
        </Router>
    </QueryClientProvider>
  )
}
