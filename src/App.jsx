import { Toaster } from 'react-hot-toast'
import ReactGA from 'react-ga4'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import Admin from './pages/Admin'
import Orders from './pages/Orders'
import Calculator from './pages/Calculator'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import AppProvider from './context/AppContext'

if (import.meta.env.VITE_GA_ENABLED === 'true') {
  ReactGA.initialize(import.meta.env.VITE_GA_MEASUREMENT_ID)
}

export default function App() {
  const queryClient = new QueryClient()

  useEffect(() => {
    ReactGA.send('pageview')
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools initialIsOpen={false} />
      <AppProvider>
        <Toaster position='top-right' toastOptions={{ duration: 3000, style: { borderRadius: '12px', padding: '12px 16px' } }} />
        <Router>
          <Routes>
            <Route path='/' element={<Home />} />
            <Route path='/products' element={<Products />} />
            <Route path='/product/:id' element={<ProductDetail />} />
            <Route path='/admin' element={<Admin />} />
            <Route path='/admin/orders' element={<Orders />} />
            <Route path='/admin/calculator' element={<Calculator />} />
          </Routes>
        </Router>
      </AppProvider>
    </QueryClientProvider>
  )
}
