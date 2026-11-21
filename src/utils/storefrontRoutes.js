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

/** Where "Volver" should go: browser back when this tab has in-app history (react-router idx > 0), else the home page. */
export function backTarget(historyState) {
  return historyState && Number(historyState.idx) > 0 ? -1 : '/'
}
