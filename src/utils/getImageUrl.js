export function getImageUrl(productImage) {
  if (productImage) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    return `${supabaseUrl}/storage/v1/object/public/images/${productImage}`
  }

  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#51c879" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#50bfe6" stop-opacity="0.15"/>
      </linearGradient></defs>
      <rect width="500" height="500" fill="url(#g)"/>
      <text x="250" y="230" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#51c879" opacity="0.6">🎨</text>
      <text x="250" y="290" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#9ca3af">Imagen no disponible</text>
    </svg>`
  )}`
}
