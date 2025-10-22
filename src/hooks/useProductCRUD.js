import { useState } from 'react'
import { supabase } from '../config/supabaseClient'

export const useProductCRUD = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const uploadImage = async (file, folder = 'products') => {
    if (!file) return null
    
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `${folder}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, file)

    if (uploadError) {
      throw new Error(`Error uploading image: ${uploadError.message}`)
    }

    return filePath
  }

  const createProduct = async (productData, imageFiles = {}) => {
    setLoading(true)
    setError(null)

    try {
      // Upload main image
      let mainImagePath = null
      if (imageFiles.main) {
        mainImagePath = await uploadImage(imageFiles.main)
      }

      // Upload secondary images
      let secondaryImagePaths = []
      if (imageFiles.secondary && imageFiles.secondary.length > 0) {
        const uploadPromises = imageFiles.secondary.map(file => uploadImage(file))
        const uploadedPaths = await Promise.all(uploadPromises)
        secondaryImagePaths = uploadedPaths.filter(path => path !== null)
      }

      const finalProductData = {
        ...productData,
        price: parseFloat(productData.price),
        stock_quantity: parseInt(productData.stock_quantity),
        image_url: mainImagePath,
        secondary_images: secondaryImagePaths
      }

      const { data, error } = await supabase
        .from('products')
        .insert([finalProductData])
        .select()

      if (error) throw error

      return data[0]
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateProduct = async (id, productData, imageFiles = {}) => {
    setLoading(true)
    setError(null)

    try {
      let updateData = { ...productData }

      // Upload new main image if provided
      if (imageFiles.main) {
        updateData.image_url = await uploadImage(imageFiles.main)
      }

      // Upload new secondary images if provided
      if (imageFiles.secondary && imageFiles.secondary.length > 0) {
        const uploadPromises = imageFiles.secondary.map(file => uploadImage(file))
        const uploadedPaths = await Promise.all(uploadPromises)
        updateData.secondary_images = uploadedPaths.filter(path => path !== null)
      }

      updateData.price = parseFloat(updateData.price)
      updateData.stock_quantity = parseInt(updateData.stock_quantity)

      const { data, error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .select()

      if (error) throw error

      return data[0]
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteProduct = async (id) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) throw error

      return true
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      return data || []
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    error,
    createProduct,
    updateProduct,
    deleteProduct,
    fetchProducts,
    uploadImage
  }
}