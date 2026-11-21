import { useQuery } from '@tanstack/react-query'
import { supabase } from '../config/supabaseClient'
import { COLUMNS, TABLE } from '../utils/constants'
import { productOptionalColumnsFallback } from '../utils/productPricePayload.js'

const fetchData = async ({ table, options }) => {
  let columns = COLUMNS[table] || '*'
  while (true) {
    let query = supabase.from(table).select(columns)

    if (options?.filters) {
      options.filters.forEach(({ column, value, operator = 'eq' }) => {
        query = query.filter(column, operator, value)
      })
    }

    if (options?.order) {
      const { column, ascending = true } = options.order
      query = query.order(column, { ascending, nullsFirst: false })
    }

    const { data, error } = await query
    if (!error) return data
    // Product migrations may lag deployment. Keep explicit selection and scope;
    // remove only a confirmed missing optional column (at most two retries).
    const selected = Object.fromEntries(columns.split(',').map(column => [column.trim(), true]))
    const legacy = table === TABLE.PRODUCT ? productOptionalColumnsFallback(selected, error) : null
    if (!legacy) throw error
    columns = Object.keys(legacy).join(', ')
  }
}

export const useSupabaseQuery = (table, options = {}) => {
  return useQuery({
    queryKey: [table, options],
    queryFn: () => fetchData({ table, options }),
    refetchInterval: options.refetchInterval ?? false,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
