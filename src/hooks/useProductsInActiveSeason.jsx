import { supabase } from '../config/supabaseClient'
import { useQuery } from '@tanstack/react-query'

export function useProductsInActiveSeason() {
  return useQuery({
    queryKey: ['productsInActiveSeason'],
    queryFn: fetchProductsInActiveSeason,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })
}

const fetchProductsInActiveSeason = async () => {
  const { data: activeSeason, error: seasonError } = await supabase
    .from('season')
    .select('id')
    .eq('is_active', true)
    .single()

  if (seasonError || !activeSeason) {
    throw new Error('No active season found.')
  }

  const { data: productsData, error: productsError } = await supabase
    .from('product_season')
    .select(
      'products(id, name, price, description, image_url, category_id, stock_quantity)'
    )
    .eq('season_id', activeSeason.id)

  if (productsError) {
    throw productsError
  }

  return productsData.map((item) => item.products)
}
