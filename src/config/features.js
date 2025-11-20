// Feature flags for easy toggling of functionality
export const FEATURES = {
  // Set to true to enable cart functionality, false for direct WhatsApp quotes
  CART_ENABLED: false,
  
  // Set to true to show cart button in header
  SHOW_CART_BUTTON: false,
  
  // Set to true to show cart modal and notifications
  SHOW_CART_COMPONENTS: false
}

// Instructions for re-enabling cart functionality:
// 1. Set CART_ENABLED to true
// 2. Set SHOW_CART_BUTTON to true  
// 3. Set SHOW_CART_COMPONENTS to true
// 4. In ProductCard.jsx, change onQuoteClick to call onAddToCartClick instead
// 5. In Header.jsx, remove 'hidden' class from cart button
// 6. In Home.jsx, remove 'hidden' wrapper from CartModal and CartNotification