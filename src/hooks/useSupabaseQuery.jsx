import { useQuery } from '@tanstack/react-query'
import { supabase } from '../config/supabaseClient'
import { COLUMNS } from '../utils/constants'

const fetchData = async ({ table, options }) => {
  const columns = COLUMNS[table] || '*'
  let query = supabase.from(table).select(columns)

  if (options?.filters) {
    options.filters.forEach(({ column, value, operator = 'eq' }) => {
      query = query.filter(column, operator, value)
    })
  }

  if (options?.order) {
    const { column, ascending = true } = options.order
    query = query.order(column, { ascending })
  }

  const { data, error } = await query
  if (error) throw error
  return data
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
