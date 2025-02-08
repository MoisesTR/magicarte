import ReactGA from 'react-ga4'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Products from './pages/Products'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

if (import.meta.env.VITE_GA_ENABLED === "true") {
  ReactGA.initialize(import.meta.env.VITE_GA_MEASUREMENT_ID);
}

export default function App() {
  const queryClient = new QueryClient()
  useEffect(() => {
    ReactGA.send('pageview')
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools initialIsOpen={false} />
      <Router>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/products' element={<Products />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  )
}
