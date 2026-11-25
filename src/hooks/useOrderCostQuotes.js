import { useQuery } from '@tanstack/react-query'
import { fetchProductCostQuotes } from '../data/calcQuotes'

export default function useOrderCostQuotes(orders, editorItems, businessId, enabled) {
  const productIds = [...new Set([
    ...orders.flatMap(order => (order.order_items || []).map(item => item.product_id)),
    ...editorItems.map(item => item.product_id),
  ].filter(Boolean))].sort()
  return useQuery({
    queryKey: ['order-cost-quotes', businessId, productIds],
    enabled: Boolean(enabled && businessId && productIds.length),
    queryFn: async () => {
      const { data, error } = await fetchProductCostQuotes(productIds, businessId)
      if (error) throw error
      return Object.fromEntries((data || []).filter(row => row.cost_quote).map(row => [row.id, row.cost_quote]))
    },
    staleTime: Infinity,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  })
}
