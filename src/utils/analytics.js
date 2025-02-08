import ReactGA from 'react-ga4'

export const trackAddToCart = (product) => {
  ReactGA.event('add_to_cart', {
    item_name: product.name,
    item_id: product.id,
    price: product.price,
  })
}
