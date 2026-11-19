import { uploadDesignPhotos } from '../utils/productDesignPhotos.js'
import { uploadCompressedImage } from '../utils/uploadImage'
import { getImageUrl } from '../utils/getImageUrl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchProductOptions,
  fetchPublicProductOptions,
  fetchPublicPresentations,
  saveProductOptions,
} from '../data/productPresentations'
import {
  presentationPrice,
  validateProductOptions,
  identifyOptions,
} from '../utils/productPresentations'

export function usePublicProductOptions(productId) {
  return useQuery({
    queryKey: ['public-product-options', productId],
    enabled: !!productId,
    queryFn: async () => {
      const result = await fetchPublicProductOptions(productId)
      if (result.error) throw result.error
      return result
    },
    staleTime: 60000,
    retry: false,
  })
}
export function usePublicPresentations(businessId) {
  return useQuery({
    queryKey: ['public-presentations', businessId],
    enabled: businessId != null,
    queryFn: async () => {
      const result = await fetchPublicPresentations(businessId)
      if (result.error) throw result.error
      return result.data || []
    },
    staleTime: 60000,
    retry: false,
  })
}
export function useProductOptionsEditor(productId, businessId, open) {
  const client = useQueryClient()
  const empty = { presentations: [], designs: [] }
  const [state, setState] = useState({
    ...empty,
    available: false,
    loading: true,
    error: null,
  })
  const original = useRef(empty)
  const generation = useRef(0)
  const [resetVersion, setResetVersion] = useState(0)
  const reset = useCallback(() => {
    generation.current += 1
    setResetVersion((value) => value + 1)
  }, [])
  useEffect(() => {
    const request = ++generation.current
    setState({
      presentations: [],
      designs: [],
      available: false,
      loading: true,
      error: null,
    })
    if (!open || businessId == null) return
    fetchProductOptions(
      productId || '00000000-0000-0000-0000-000000000000',
      businessId
    )
      .then((result) => {
        if (request !== generation.current) return
        original.current = result
        setState({ ...result, loading: false })
      })
      .catch((error) => {
        if (request === generation.current)
          setState((previous) => ({ ...previous, loading: false, error }))
      })
    return () => {
      generation.current += 1
    }
  }, [productId, businessId, open, resetVersion])
  const currentGeneration = generation.current
  return {
    ...state,
    revision: resetVersion,
    reset,
    setOptions: (changes) => {
      if (currentGeneration !== generation.current) return
      setState((previous) => ({
        ...previous,
        ...changes,
        ...(changes.presentations
          ? { presentations: identifyOptions(changes.presentations) }
          : {}),
        ...(changes.designs
          ? { designs: identifyOptions(changes.designs) }
          : {}),
      }))
    },
    hasPresentations:
      state.available &&
      state.presentations.some((row) => row.is_active !== false),
    price: (fallback) =>
      state.available
        ? presentationPrice(state.presentations, fallback)
        : Number(fallback),
    validate() {
      if (state.loading || state.error || state.uploading)
        throw new Error(
          'No se pudieron cargar las presentaciones. Cierra y vuelve a abrir el producto.'
        )
      const error =
        state.available &&
        validateProductOptions(state.presentations, state.designs)
      if (error) throw new Error(error)
    },
    async save(id) {
      if (!state.available) return
      const designs = await uploadDesignPhotos(state.designs, {
        upload: uploadCompressedImage,
        resolveUrl: getImageUrl,
      })
      if (currentGeneration !== generation.current) return
      setState((previous) => ({ ...previous, designs }))
      const { error } = await saveProductOptions(
        id,
        businessId,
        { ...state, designs },
        original.current
      )
      if (error) throw error
      await client.invalidateQueries({ queryKey: ['public-presentations'] })
      await client.invalidateQueries({
        queryKey: ['public-product-options', id],
      })
    },
  }
}
