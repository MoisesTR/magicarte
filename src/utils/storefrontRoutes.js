// App.jsx exposes a product storefront only for Magic Arte. Other businesses
// have private product screens (and a filament color page, not a public shop).
export function storefrontHomePath(businessSlug) {
  return businessSlug === 'magicarte' ? '/' : null
}

export function storefrontProductPath(businessSlug, productId) {
  return storefrontHomePath(businessSlug) && productId != null
    ? `/product/${encodeURIComponent(productId)}`
    : null
}
