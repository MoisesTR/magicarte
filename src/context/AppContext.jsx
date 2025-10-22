import React, { createContext, useContext, useState, useEffect } from 'react'

const CART_STORAGE_KEY = 'cartItems'

const AppContext = createContext()

export default function AppProvider({ children }) {
  const [itemAdded, setItemAdded] = useState(false)
  const [showCartModal, setShowCartModal] = useState(false)
  const [showCartNotification, setShowCartNotification] = useState(false)
  const [cart, setCart] = useState(() => {
    try {
      const storedCart = localStorage.getItem(CART_STORAGE_KEY)
      return storedCart ? JSON.parse(storedCart) : []
    } catch (error) {
      console.error('Failed to retrieve cart from localStorage:', error)
      return []
    }
  })

  // Mobile detection
  const isMobile = () => {
    return window.innerWidth <= 768
  }

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error)
    }
  }, [cart])

  const addItem = (item) => {
    setCart((prevCart) => {
      const exists = prevCart.find((cartItem) => cartItem.id === item.id)
      if (exists) {
        return prevCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        )
      }
      return [...prevCart, { ...item, quantity: 1 }]
    })
    setItemAdded(true)
    
    // Mobile-friendly behavior
    if (isMobile()) {
      // On mobile, show notification instead of opening cart
      setShowCartNotification(true)
      setTimeout(() => setShowCartNotification(false), 3000)
    } else {
      // On desktop, auto-show cart like Amazon
      setShowCartModal(true)
    }
  }

  const removeItem = (itemId) => {
    setCart((prevCart) => prevCart.filter((cartItem) => cartItem.id !== itemId))
  }

  const hasItem = (itemId) => cart.some((cartItem) => cartItem.id === itemId)

  const updateItemQuantity = (itemId, quantity) => {
    setCart((prevCart) =>
      prevCart.map((cartItem) =>
        cartItem.id === itemId ? { ...cartItem, quantity } : cartItem
      )
    )
  }

  const clearCart = () => {
    setCart([])
  }

  const value = {
    cart,
    addItem,
    removeItem,
    updateItemQuantity,
    clearCart,
    hasItem,
    itemAdded,
    setItemAdded,
    showCartModal,
    setShowCartModal,
    showCartNotification,
    setShowCartNotification,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
