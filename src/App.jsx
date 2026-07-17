import { Toaster } from 'react-hot-toast'
import { BrowserRouter as Router, Navigate, Routes, Route, useLocation, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ErrorBoundary from './components/ErrorBoundary'
import { initializeGoogleAnalytics, trackPageView } from './utils/analytics'
import { BusinessProvider, useBusiness } from './context/BusinessContext'
import AdminChrome from './components/AdminChrome'

const Home = lazy(() => import('./pages/Home'))
const Products = lazy(() => import('./pages/Products'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const Clients = lazy(() => import('./pages/Clients'))
const Finances = lazy(() => import('./pages/Finances'))
const ShippingPolicy = lazy(() => import('./pages/ShippingPolicy'))
const FAQ = lazy(() => import('./pages/FAQ'))
const About = lazy(() => import('./pages/About'))

// Per-business admin pages. Magic Arte keeps its original screens (Orders/Admin);
// Hikari and Joyería get their own, so each business owns the fields it needs.
const MagicArteOrders = lazy(() => import('./pages/Orders'))
const MagicArteProducts = lazy(() => import('./pages/Admin'))
const HikariOrders = lazy(() => import('./pages/hikari/Orders'))
const HikariProducts = lazy(() => import('./pages/hikari/Products'))
const JoyeriaOrders = lazy(() => import('./pages/joyeria/Orders'))
const JoyeriaProducts = lazy(() => import('./pages/joyeria/Products'))
const Inventory = lazy(() => import('./pages/Inventory'))

// Tab → per-business component. Falls back to the Magic Arte screen for any
// business without its own variant yet.
const ORDERS_BY_BUSINESS = {
  hikari: HikariOrders,
  'joyeria-trigueros': JoyeriaOrders,
}
const PRODUCTS_BY_BUSINESS = {
  hikari: HikariProducts,
  'joyeria-trigueros': JoyeriaProducts,
}

function BusinessOrders() {
  const { business } = useParams()
  const Page = ORDERS_BY_BUSINESS[business] || MagicArteOrders
  return <Page />
}

function BusinessProducts() {
  const { business } = useParams()
  const Page = PRODUCTS_BY_BUSINESS[business] || MagicArteProducts
  return <Page />
}

// Bare /admin → last-used business (or Magic Arte), Orders tab.
function AdminIndexRedirect() {
  const savedSlug = localStorage.getItem('hq.currentBusinessSlug')
  const slug = savedSlug && savedSlug !== 'all' ? savedSlug : 'magicarte'
  return <Navigate to={`/admin/${slug}/orders`} replace />
}

initializeGoogleAnalytics()

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function AnalyticsPageTracker() {
  const { pathname, search } = useLocation()
  const { rootRedirectPending, rootRedirectTo } = useBusiness()

  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    // Don't log a storefront pageview for a signed-in user who's about to be
    // (or might be) bounced straight to their own admin dashboard.
    if (pathname === '/' && (rootRedirectPending || rootRedirectTo)) return
    trackPageView(`${pathname}${search}`)
  }, [pathname, search, rootRedirectPending, rootRedirectTo])

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
          <BusinessProvider>
            <AnalyticsPageTracker />
            <AdminChrome />
            <Suspense fallback={<div className='min-h-screen bg-gray-50 flex items-center justify-center text-gray-600'>Cargando...</div>}>
            <ErrorBoundary>
              <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/products' element={<Products />} />
                <Route path='/product/:id' element={<ProductDetail />} />
                {/* Admin: the active business lives in the URL. */}
                <Route path='/admin' element={<AdminIndexRedirect />} />
                <Route path='/admin/:business/orders' element={<BusinessOrders />} />
                <Route path='/admin/:business/products' element={<BusinessProducts />} />
                <Route path='/admin/:business/inventory' element={<Inventory />} />
                <Route path='/admin/:business/clients' element={<Clients />} />
                <Route path='/admin/:business/finances' element={<Finances />} />
                {/* Legacy un-scoped admin URLs → Magic Arte. */}
                <Route path='/admin/orders' element={<Navigate to='/admin/magicarte/orders' replace />} />
                <Route path='/admin/products' element={<Navigate to='/admin/magicarte/products' replace />} />
                <Route path='/admin/inventory' element={<Navigate to='/admin/magicarte/inventory' replace />} />
                <Route path='/admin/clients' element={<Navigate to='/admin/magicarte/clients' replace />} />
                <Route path='/admin/finances' element={<Navigate to='/admin/magicarte/finances' replace />} />
                <Route path='/politica-de-envio' element={<ShippingPolicy />} />
                <Route path='/faq' element={<FAQ />} />
                <Route path='/acerca-de-nosotros' element={<About />} />
              </Routes>
            </ErrorBoundary>
            </Suspense>
          </BusinessProvider>
        </Router>
    </QueryClientProvider>
  )
}
