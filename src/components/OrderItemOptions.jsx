import { getImageUrl } from '../utils/getImageUrl'
import ProductPresentationSelector from './ProductPresentationSelector'
import ProductDesignPicker from './ProductDesignPicker'
import { presentationSnapshot } from '../utils/productPresentations'
export default function OrderItemOptions({ item, product, onChange }) {
  const presentations = product?.presentations || []
  const designs = product?.designs || []
  if (
    !product &&
    !item.product_id &&
    !presentations.length &&
    !designs.length &&
    !item.presentation_label &&
    !item.designs?.length
  )
    return null
  const selected = item.presentation_label
    ? {
        id: item.presentation_id,
        label: item.presentation_label,
        units: item.units_per_presentation,
        price: item.unit_price,
      }
    : null
  return (
    <div className='min-w-0 space-y-3 border-t border-gray-200 pt-3'>
      {(product || item.product_id || presentations.length > 0 || selected) && (
        <ProductPresentationSelector
          admin
          presentations={presentations}
          selected={selected}
          onChange={(row) => onChange({ ...presentationSnapshot(row) })}
        />
      )}
      {(designs.length > 0 || item.designs?.length > 0) && (
        <ProductDesignPicker
          designs={designs}
          mainImageUrl={
            product?.image_url ? getImageUrl(product.image_url) : null
          }
          selections={item.designs || []}
          packs={item.quantity}
          units={item.units_per_presentation || 1}
          onChange={(rows) => onChange({ designs: rows })}
          admin
        />
      )}
    </div>
  )
}
