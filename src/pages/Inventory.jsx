import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import AdminLogin from '../components/AdminLogin'
import { supabase } from '../config/supabaseClient'
import { useBusiness } from '../context/BusinessContext'
import {
  addInventoryMovement,
  createInventoryItem,
  fetchInventoryMovements,
  fetchInventoryStock,
  removeInventoryItem,
  updateInventoryItem,
} from '../data/inventory'

const ITEM_TYPES = {
  material: 'Materia prima',
  finished_good: 'Pieza terminada',
  supply: 'Insumo',
}

const FILAMENT_MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'Otro']
const FILAMENT_UNITS = {
  spool: 'spools',
  g: 'gramos',
}
const COLOR_OPTIONS = [
  ['Negro', '#111827'],
  ['Carbón', '#374151'],
  ['Blanco', '#f8fafc'],
  ['Marfil', '#fef3c7'],
  ['Gris', '#94a3b8'],
  ['Plata', '#cbd5e1'],
  ['Dorado', '#d4a017'],
  ['Cobre', '#b45309'],
  ['Rojo', '#dc2626'],
  ['Vino', '#881337'],
  ['Coral', '#fb7185'],
  ['Azul', '#2563eb'],
  ['Celeste', '#38bdf8'],
  ['Turquesa', '#06b6d4'],
  ['Azul marino', '#1e3a8a'],
  ['Verde', '#16a34a'],
  ['Verde lima', '#84cc16'],
  ['Verde olivo', '#4d7c0f'],
  ['Amarillo', '#eab308'],
  ['Naranja', '#f97316'],
  ['Beige', '#d6b98c'],
  ['Café', '#854d0e'],
  ['Chocolate', '#5c3317'],
  ['Morado', '#7c3aed'],
  ['Lila', '#c084fc'],
  ['Magenta', '#c026d3'],
  ['Rosa', '#ec4899'],
  ['Rosa palo', '#d8a7b1'],
  ['Fucsia', '#e11d8f'],
  ['Camel', '#c19a6b'],
  ['Marrón', '#6f4e37'],
  ['Crema', '#fffdd0'],
  ['Lavanda', '#b57edc'],
  ['Verde menta', '#98ff98'],
  ['Azul rey', '#4169e1'],
  ['Bronce', '#cd7f32'],
  ['Transparente', '#dbeafe'],
  ['Multicolor', 'conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)'],
  ['Brilla en oscuro', '#d9f99d'],
]

const MOVEMENT_TYPES = {
  opening: 'Saldo inicial',
  purchase: 'Compra',
  sale: 'Venta',
  consumption: 'Uso en pedido',
  adjustment: 'Ajuste',
  return: 'Devolución',
}

const MOVEMENT_ACTIONS = [
  {
    value: 'purchase',
    label: 'Reponer',
    description: 'Compré más del mismo artículo.',
    directionLabel: '+ Entra',
    directionClass: 'text-emerald-700',
    quantityLabel: 'Cantidad recibida',
    notePlaceholder: 'Proveedor, factura o referencia de la compra...',
    submitLabel: 'Registrar reposición',
  },
  {
    value: 'sale',
    label: 'Registrar venta',
    description: 'Vendí unidades de este artículo.',
    directionLabel: '− Sale',
    directionClass: 'text-red-600',
    quantityLabel: 'Cantidad vendida',
    notePlaceholder: 'Cliente o referencia de la venta...',
    submitLabel: 'Registrar venta',
  },
  {
    value: 'consumption',
    label: 'Usar en pedido',
    description: 'Lo utilicé para producir un pedido.',
    directionLabel: '− Sale',
    directionClass: 'text-red-600',
    quantityLabel: 'Cantidad utilizada',
    notePlaceholder: 'Pedido o trabajo donde se utilizó...',
    submitLabel: 'Registrar uso',
  },
  {
    value: 'return',
    label: 'Devolución',
    description: 'El cliente devolvió unidades.',
    directionLabel: '+ Entra',
    directionClass: 'text-emerald-700',
    quantityLabel: 'Cantidad devuelta',
    notePlaceholder: 'Cliente o motivo de la devolución...',
    submitLabel: 'Registrar devolución',
  },
  {
    value: 'adjustment',
    label: 'Corregir conteo',
    description: 'El stock real no coincide con el sistema.',
    directionLabel: '± Ajuste',
    directionClass: 'text-amber-700',
    quantityLabel: 'Cantidad del ajuste',
    notePlaceholder: 'Explica por qué estás corrigiendo el conteo...',
    submitLabel: 'Guardar ajuste',
  },
]

const STOCK_FLOW_OPTIONS = [
  { value: 'in', label: 'Entrada', description: 'Compra o devolución' },
  { value: 'out', label: 'Salida', description: 'Venta o uso' },
  { value: 'adjustment', label: 'Corrección', description: 'Conteo físico' },
]

const FIXED_EXCHANGE_RATE_TO_NIO = 36.6243

const INVENTORY_UNIT_OPTIONS = [
  'unidad',
  'pieza',
  'par',
  'set',
  'paquete',
  'caja',
  'bolsa',
  'docena',
  'rollo',
  'hoja',
  'spool',
  'g',
  'kg',
  'm',
  'cm',
  'litro',
  'ml',
]
const QUICK_UNIT_OPTIONS = ['unidad', 'pieza', 'par', 'paquete', 'caja', 'bolsa']
const DEFAULT_SUPPLIER_OPTIONS = ['Amazon', 'Temu', 'AliExpress', 'SHEIN', 'Proveedor local']

function uniqueTextOptions(values) {
  const seen = new Set()
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value) return false
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const itemFormInitial = {
  name: '',
  sku: '',
  color: '',
  item_type: 'material',
  unit: 'unidad',
  opening_quantity: '',
  purchase_cost: '',
  purchase_cost_mode: 'total',
  purchase_currency: 'USD',
  delivery_cost: '',
  delivery_currency: 'USD',
  low_stock_threshold: '',
  unit_cost: '',
  supplier_name: '',
  notes: '',
  is_active: true,
}

const movementFormInitial = {
  inventory_item_id: '',
  movement_type: 'purchase',
  adjustment_direction: 'in',
  quantity: '',
  unit_cost: '',
  purchase_cost: '',
  purchase_cost_mode: 'total',
  purchase_currency: 'USD',
  delivery_cost: '',
  delivery_currency: 'USD',
  note: '',
  quantity_unit: 'g',
}

const filamentFormInitial = {
  color: '',
  material: 'PLA',
  quantity: '',
  quantity_unit: 'spool',
  grams_per_spool: '1000',
  low_stock_quantity: '',
  purchase_cost: '',
  purchase_cost_mode: 'total',
  purchase_currency: 'USD',
  delivery_cost: '',
  delivery_currency: 'USD',
  supplier_name: '',
  notes: '',
}

const money = (value) => `C$ ${Number(value || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const preciseMoney = (value) => `C$ ${Number(value || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const amount = (value) => Number(value || 0).toLocaleString('es-NI', { maximumFractionDigits: 3 })
const exchangeRate = (value) => Number(value || 0).toLocaleString('es-NI', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

const originalMoney = (value, currency = 'NIO') => {
  const formatted = Number(value || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency === 'USD' ? `US$ ${formatted}` : `C$ ${formatted}`
}

const originalUnitMoney = (value, currency = 'NIO') => {
  const formatted = Number(value || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
  return currency === 'USD' ? `US$ ${formatted}` : `C$ ${formatted}`
}

function usesUsd(form) {
  const purchaseUsesUsd = form.purchase_currency === 'USD' && Number(form.purchase_cost) > 0
  const deliveryUsesUsd = form.delivery_currency === 'USD' && Number(form.delivery_cost) > 0
  return purchaseUsesUsd || deliveryUsesUsd
}

function hasUsdCurrency(form) {
  return form.purchase_currency === 'USD' || form.delivery_currency === 'USD'
}

function purchaseQuantity(form) {
  const quantity = Number(Object.hasOwn(form, 'opening_quantity') ? form.opening_quantity : form.quantity)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function purchaseOriginalTotal(form) {
  const enteredCost = Number(form.purchase_cost) || 0
  return roundCurrency(form.purchase_cost_mode === 'unit' ? enteredCost * purchaseQuantity(form) : enteredCost)
}

function landedCost(form) {
  const purchaseOriginal = purchaseOriginalTotal(form)
  const deliveryOriginal = Number(form.delivery_cost) || 0
  const exchangeRate = usesUsd(form) ? FIXED_EXCHANGE_RATE_TO_NIO : 1
  const purchaseNio = Math.round((purchaseOriginal * (form.purchase_currency === 'USD' ? exchangeRate : 1) + Number.EPSILON) * 100) / 100
  const deliveryNio = Math.round((deliveryOriginal * (form.delivery_currency === 'USD' ? exchangeRate : 1) + Number.EPSILON) * 100) / 100

  return {
    purchaseOriginal,
    deliveryOriginal,
    exchangeRate,
    purchaseNio,
    deliveryNio,
    totalNio: purchaseNio + deliveryNio,
  }
}

function purchaseCostError(form, { required = false } = {}) {
  const hasPurchaseCost = form.purchase_cost !== ''
  const hasDeliveryCost = form.delivery_cost !== ''
  if (required && !hasPurchaseCost) return 'Escribe el costo de la compra'
  if (!hasPurchaseCost && hasDeliveryCost) return 'Escribe el costo de la compra para poder incluir el delivery'
  if (!hasPurchaseCost) return null

  const purchaseCost = Number(form.purchase_cost)
  const deliveryCost = Number(form.delivery_cost || 0)
  if (!Number.isFinite(purchaseCost) || purchaseCost < 0) return 'El costo de la compra no puede ser negativo'
  if (!Number.isFinite(deliveryCost) || deliveryCost < 0) return 'El delivery no puede ser negativo'
  if (form.purchase_cost_mode === 'unit' && !(purchaseQuantity(form) > 0)) return 'Escribe la cantidad para calcular el costo total'
  return null
}

function purchaseMovementCost(form) {
  const cost = landedCost(form)
  const purchaseCurrency = cost.purchaseOriginal > 0 ? form.purchase_currency : 'NIO'
  const deliveryCurrency = cost.deliveryOriginal > 0 ? form.delivery_currency : 'NIO'
  return {
    purchase_cost: cost.purchaseNio,
    delivery_cost: cost.deliveryNio,
    purchase_currency: purchaseCurrency,
    delivery_currency: deliveryCurrency,
    exchange_rate_to_nio: cost.exchangeRate,
    original_purchase_cost: cost.purchaseOriginal,
    original_delivery_cost: cost.deliveryOriginal,
  }
}

function filamentAmount(grams, gramsPerSpool) {
  const spoolWeight = Number(gramsPerSpool || 0)
  if (!(spoolWeight > 0)) return `${amount(grams)} g`
  const spools = Number(grams || 0) / spoolWeight
  return `${amount(spools)} spool${Math.abs(spools) === 1 ? '' : 's'} · ${amount(grams)} g`
}

function inventoryAmount(item, value) {
  if (!item) return '—'
  return item.inventory_kind === 'filament'
    ? filamentAmount(value, item.grams_per_spool)
    : `${amount(value)} ${item.unit}`
}

function inventoryColor(colorName) {
  return COLOR_OPTIONS.find(([name]) => name.toLowerCase() === String(colorName || '').toLowerCase())?.[1] || '#e5e7eb'
}

function itemColorName(item) {
  return item?.inventory_kind === 'filament' ? item.filament_color : item?.variant_color
}

function generalItemDetail(item) {
  return [item.variant_color ? `Color: ${item.variant_color}` : null, item.sku || item.supplier_name || 'Sin código / proveedor']
    .filter(Boolean)
    .join(' · ')
}

function normaliseItem(form) {
  return {
    name: form.name.trim(),
    sku: form.sku.trim() || null,
    variant_color: form.color.trim() || null,
    item_type: form.item_type,
    unit: form.unit.trim() || 'unidad',
    low_stock_threshold: Number(form.low_stock_threshold) || 0,
    unit_cost: Number(form.unit_cost) || 0,
    supplier_name: form.supplier_name.trim() || null,
    notes: form.notes.trim() || null,
    is_active: form.is_active,
  }
}

/** Shared, business-scoped stock ledger for Joyería and future businesses. */
export default function Inventory() {
  const { currentBusiness, currentBusinessId } = useBusiness()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [items, setItems] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showItemForm, setShowItemForm] = useState(false)
  const [showMovementForm, setShowMovementForm] = useState(false)
  const [showFilamentForm, setShowFilamentForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editingFilament, setEditingFilament] = useState(null)
  const [removalTarget, setRemovalTarget] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [itemForm, setItemForm] = useState(itemFormInitial)
  const [movementForm, setMovementForm] = useState(movementFormInitial)
  const [filamentForm, setFilamentForm] = useState(filamentFormInitial)
  const [filter, setFilter] = useState('active')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser)
      setCheckingAuth(false)
    })
  }, [])

  useEffect(() => {
    setRemovalTarget(null)
    setShowMovementForm(false)
    setMovementForm(movementFormInitial)
    setShowItemForm(false)
    setEditingItem(null)
    setItemForm(itemFormInitial)
    setShowFilamentForm(false)
    setEditingFilament(null)
    setFilamentForm(filamentFormInitial)
    if (user && currentBusinessId) loadInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentBusinessId])

  const loadInventory = async () => {
    setLoading(true)
    const [stockResult, movementResult] = await Promise.all([
      fetchInventoryStock(currentBusinessId),
      fetchInventoryMovements(currentBusinessId),
    ])
    if (stockResult.error) toast.error(`No se pudo cargar el inventario: ${stockResult.error.message}`)
    else setItems(stockResult.data || [])
    if (movementResult.error) toast.error(`No se pudo cargar el historial: ${movementResult.error.message}`)
    else setMovements(movementResult.data || [])
    setLoading(false)
  }

  const visibleItems = useMemo(() => {
    if (filter === 'low') return items.filter((item) => item.is_low_stock && item.is_active)
    if (filter === 'all') return items
    return items.filter((item) => item.is_active)
  }, [filter, items])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const activeItems = useMemo(() => items.filter((item) => item.is_active), [items])
  const unitOptions = useMemo(
    () => uniqueTextOptions([...INVENTORY_UNIT_OPTIONS, ...items.map((item) => item.unit)]),
    [items],
  )
  const supplierOptions = useMemo(
    () => uniqueTextOptions([...DEFAULT_SUPPLIER_OPTIONS, ...items.map((item) => item.supplier_name)]),
    [items],
  )
  const isHikari = currentBusiness?.slug === 'hikari'
  const lowStockCount = items.filter((item) => item.is_low_stock && item.is_active).length
  const totalValue = items
    .filter((item) => item.is_active)
    .reduce((total, item) => total + Number(item.current_stock || 0) * Number(item.unit_cost || 0), 0)
  const movementItem = itemById.get(movementForm.inventory_item_id)
  const movementIsFilament = movementItem?.inventory_kind === 'filament'
  const movementQuantityInStockUnit = movementIsFilament && movementForm.quantity_unit === 'spool'
    ? Number(movementForm.quantity || 0) * Number(movementItem.grams_per_spool || 0)
    : Number(movementForm.quantity || 0)
  const movementFlow = ['purchase', 'return'].includes(movementForm.movement_type)
    ? 'in'
    : ['sale', 'consumption'].includes(movementForm.movement_type) ? 'out' : 'adjustment'
  const movementReasonActions = movementFlow === 'in'
    ? MOVEMENT_ACTIONS.filter((action) => ['purchase', 'return'].includes(action.value))
    : MOVEMENT_ACTIONS.filter((action) => ['sale', 'consumption'].includes(action.value))
  const movementAction = MOVEMENT_ACTIONS.find((action) => action.value === movementForm.movement_type) || MOVEMENT_ACTIONS[0]
  const movementDirection = movementForm.movement_type === 'adjustment'
    ? movementForm.adjustment_direction === 'out' ? -1 : 1
    : ['sale', 'consumption'].includes(movementForm.movement_type) ? -1 : 1
  const movementProjectedStock = movementItem && movementQuantityInStockUnit > 0
    ? Number(movementItem.current_stock || 0) + movementQuantityInStockUnit * movementDirection
    : null
  const movementQuantityLabel = `${movementAction.quantityLabel}${movementIsFilament ? ` (${FILAMENT_UNITS[movementForm.quantity_unit]})` : ''}`
  const itemLandedCost = landedCost(itemForm)
  const filamentLandedCost = landedCost(filamentForm)
  const movementLandedCost = landedCost(movementForm)
  const movementSubmitLabel = movementAction.submitLabel

  const resetItemForm = () => {
    setShowItemForm(false)
    setEditingItem(null)
    setItemForm(itemFormInitial)
  }

  const resetMovementForm = () => {
    setShowMovementForm(false)
    setMovementForm(movementFormInitial)
  }

  const resetFilamentForm = () => {
    setShowFilamentForm(false)
    setEditingFilament(null)
    setFilamentForm(filamentFormInitial)
  }

  const openCreateItem = () => {
    setEditingItem(null)
    setItemForm(itemFormInitial)
    setShowItemForm(true)
  }

  const openCreateFilament = () => {
    setEditingFilament(null)
    setFilamentForm(filamentFormInitial)
    setShowFilamentForm(true)
  }

  const openEditFilament = (item) => {
    const gramsPerSpool = Number(item.grams_per_spool || 1000)
    setEditingFilament(item)
    setFilamentForm({
      ...filamentFormInitial,
      color: item.filament_color || '',
      material: item.filament_material || 'PLA',
      grams_per_spool: String(gramsPerSpool),
      low_stock_quantity: String(Number(item.low_stock_threshold || 0) / gramsPerSpool),
      supplier_name: item.supplier_name || '',
      notes: item.notes || '',
    })
    setShowFilamentForm(true)
  }

  const changeFilamentUnit = (nextUnit) => {
    const previousUnit = filamentForm.quantity_unit
    if (previousUnit === nextUnit) return
    const gramsPerSpool = Number(filamentForm.grams_per_spool || 0)
    const convert = (value) => {
      if (value === '' || !(gramsPerSpool > 0)) return value
      return previousUnit === 'spool'
        ? String(Number(value) * gramsPerSpool)
        : String(Number(value) / gramsPerSpool)
    }
    const convertUnitPrice = (value) => {
      if (value === '' || !(gramsPerSpool > 0)) return value
      const converted = previousUnit === 'spool'
        ? Number(value) / gramsPerSpool
        : Number(value) * gramsPerSpool
      return String(Math.round((converted + Number.EPSILON) * 1_000_000) / 1_000_000)
    }
    setFilamentForm({
      ...filamentForm,
      quantity_unit: nextUnit,
      quantity: convert(filamentForm.quantity),
      low_stock_quantity: convert(filamentForm.low_stock_quantity),
      purchase_cost: filamentForm.purchase_cost_mode === 'unit'
        ? convertUnitPrice(filamentForm.purchase_cost)
        : filamentForm.purchase_cost,
    })
  }

  const changeMovementQuantityUnit = (nextUnit) => {
    setMovementForm((current) => {
      const previousUnit = current.quantity_unit
      if (previousUnit === nextUnit) return current

      const gramsPerSpool = Number(movementItem?.grams_per_spool || 0)
      if (!(gramsPerSpool > 0)) return { ...current, quantity_unit: nextUnit }

      const convert = (value) => {
        if (value === '') return value
        return previousUnit === 'spool'
          ? String(Number(value) * gramsPerSpool)
          : String(Number(value) / gramsPerSpool)
      }
      const convertUnitPrice = (value) => {
        if (value === '') return value
        const converted = previousUnit === 'spool'
          ? Number(value) / gramsPerSpool
          : Number(value) * gramsPerSpool
        return String(Math.round((converted + Number.EPSILON) * 1_000_000) / 1_000_000)
      }

      return {
        ...current,
        quantity_unit: nextUnit,
        quantity: convert(current.quantity),
        purchase_cost: current.purchase_cost_mode === 'unit'
          ? convertUnitPrice(current.purchase_cost)
          : current.purchase_cost,
      }
    })
  }

  const changeMovementAction = (nextType) => {
    setMovementForm((current) => {
      if (current.movement_type === nextType) return current
      const item = itemById.get(current.inventory_item_id)
      return {
        ...movementFormInitial,
        inventory_item_id: current.inventory_item_id,
        movement_type: nextType,
        adjustment_direction: nextType === 'adjustment' ? 'in' : current.adjustment_direction,
        unit_cost: item?.unit_cost ?? '',
        quantity_unit: current.quantity_unit,
      }
    })
  }

  const changeMovementFlow = (nextFlow) => {
    if (nextFlow === movementFlow) return
    changeMovementAction(nextFlow === 'in' ? 'purchase' : nextFlow === 'out' ? 'sale' : 'adjustment')
  }

  const changeAdjustmentDirection = (nextDirection) => {
    setMovementForm((current) => current.adjustment_direction === nextDirection ? current : {
      ...current,
      adjustment_direction: nextDirection,
      quantity: '',
    })
  }

  const openEditItem = (item) => {
    setEditingItem(item)
    setItemForm({
      name: item.name || '',
      sku: item.sku || '',
      color: item.variant_color || '',
      item_type: item.item_type,
      unit: item.unit || 'unidad',
      opening_quantity: '',
      purchase_cost: '',
      purchase_cost_mode: 'total',
      purchase_currency: 'USD',
      delivery_cost: '',
      delivery_currency: 'USD',
      low_stock_threshold: item.low_stock_threshold ?? '',
      unit_cost: item.unit_cost ?? '',
      supplier_name: item.supplier_name || '',
      notes: item.notes || '',
      is_active: item.is_active,
    })
    setShowItemForm(true)
  }

  const openMovement = (item = null) => {
    setMovementForm({
      ...movementFormInitial,
      inventory_item_id: item?.id || '',
      unit_cost: item?.unit_cost ?? '',
      quantity_unit: item?.inventory_kind === 'filament' ? 'spool' : 'g',
    })
    setShowMovementForm(true)
  }

  const openDifferentItemFromMovement = (kind = 'item') => {
    resetMovementForm()
    if (kind === 'filament') openCreateFilament()
    else openCreateItem()
  }

  const confirmRemoval = (item) => {
    setRemovalTarget(item)
  }

  const removeItem = async () => {
    if (!removalTarget || removing) return

    setRemoving(true)
    try {
      const { error } = await removeInventoryItem(removalTarget.id, currentBusinessId)
      if (error) throw error

      const removedItemId = removalTarget.id
      setItems((current) => current.filter((item) => item.id !== removedItemId))
      setMovements((current) => current.filter((movement) => movement.inventory_item_id !== removedItemId))
      toast.success('Artículo e historial eliminados permanentemente.')
      setRemovalTarget(null)
      await loadInventory()
    } catch (error) {
      toast.error(`No se pudo eliminar el artículo: ${error.message}`)
    } finally {
      setRemoving(false)
    }
  }

  const saveFilament = async (event) => {
    event.preventDefault()
    const color = filamentForm.color.trim()
    const material = filamentForm.material.trim()
    const quantity = Number(filamentForm.quantity)
    const gramsPerSpool = Number(filamentForm.grams_per_spool)
    const receivedGrams = filamentForm.quantity_unit === 'spool' ? quantity * gramsPerSpool : quantity
    const lowStockQuantity = Number(filamentForm.low_stock_quantity) || 0
    const lowStockGrams = filamentForm.quantity_unit === 'spool' ? lowStockQuantity * gramsPerSpool : lowStockQuantity
    const hasPurchaseCost = filamentForm.purchase_cost !== ''
    const costError = purchaseCostError(filamentForm)

    if (!color) {
      toast.error('Escribe el color del filamento')
      return
    }
    if (!editingFilament && !(quantity > 0)) {
      toast.error(`Escribe cuántos ${FILAMENT_UNITS[filamentForm.quantity_unit]} recibiste`)
      return
    }
    if (!(gramsPerSpool > 0)) {
      toast.error('Escribe cuántos gramos tiene cada spool')
      return
    }
    if (lowStockQuantity < 0) {
      toast.error('La alerta de stock no puede ser negativa')
      return
    }
    if (costError) {
      toast.error(costError)
      return
    }

    setSaving(true)
    try {
      const item = {
        name: `Filamento ${material} · ${color}`,
        item_type: 'material',
        unit: 'g',
        inventory_kind: 'filament',
        filament_color: color,
        filament_material: material,
        grams_per_spool: gramsPerSpool,
        low_stock_threshold: lowStockGrams,
        unit_cost: editingFilament ? Number(editingFilament.unit_cost || 0) : 0,
        supplier_name: filamentForm.supplier_name.trim() || null,
        notes: filamentForm.notes.trim() || null,
        is_active: editingFilament ? editingFilament.is_active : true,
      }
      if (editingFilament) {
        const { error } = await updateInventoryItem(editingFilament.id, item, currentBusinessId)
        if (error) throw error
        toast.success(`Filamento ${color} actualizado`)
      } else {
        const { data, error } = await createInventoryItem(item, currentBusinessId)
        if (error) throw error
        const { error: movementError } = await addInventoryMovement({
          inventory_item_id: data.id,
          movement_type: hasPurchaseCost ? 'purchase' : 'opening',
          quantity_delta: receivedGrams,
          unit_cost: hasPurchaseCost ? null : 0,
          ...(hasPurchaseCost
            ? purchaseMovementCost(filamentForm)
            : { purchase_cost: null, delivery_cost: 0 }),
          note: hasPurchaseCost ? 'Compra inicial de filamento' : 'Saldo inicial de filamento',
        }, currentBusinessId)
        if (movementError) throw movementError
        toast.success(`Filamento ${color} agregado`)
      }
      resetFilamentForm()
      loadInventory()
    } catch (error) {
      toast.error(`No se pudo guardar el filamento: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const saveItem = async (event) => {
    event.preventDefault()
    if (!itemForm.name.trim()) {
      toast.error('Escribe el nombre del artículo')
      return
    }
    const receivedQuantity = Number(itemForm.opening_quantity)
    const hasPurchaseCost = itemForm.purchase_cost !== ''
    const costError = purchaseCostError(itemForm)
    if (receivedQuantity < 0) {
      toast.error('La cantidad recibida no puede ser negativa')
      return
    }
    if (hasPurchaseCost && !(receivedQuantity > 0)) {
      toast.error('Escribe cuántas unidades recibiste')
      return
    }
    if (costError) {
      toast.error(costError)
      return
    }

    setSaving(true)
    try {
      const item = normaliseItem(itemForm)
      if (editingItem) {
        const { error } = await updateInventoryItem(editingItem.id, item, currentBusinessId)
        if (error) throw error
        toast.success('Artículo actualizado')
      } else {
        const { data, error } = await createInventoryItem(item, currentBusinessId)
        if (error) throw error
        if (receivedQuantity > 0) {
          const { error: movementError } = await addInventoryMovement({
            inventory_item_id: data.id,
            movement_type: hasPurchaseCost ? 'purchase' : 'opening',
            quantity_delta: receivedQuantity,
            unit_cost: hasPurchaseCost ? null : item.unit_cost,
            ...(hasPurchaseCost
              ? purchaseMovementCost(itemForm)
              : { purchase_cost: null, delivery_cost: 0 }),
            note: hasPurchaseCost ? 'Compra inicial' : 'Saldo inicial',
          }, currentBusinessId)
          if (movementError) throw movementError
        }
        toast.success('Artículo agregado al inventario')
      }
      resetItemForm()
      loadInventory()
    } catch (error) {
      toast.error(`No se pudo guardar: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const saveMovement = async (event) => {
    event.preventDefault()
    const item = itemById.get(movementForm.inventory_item_id)
    const enteredQuantity = Number(movementForm.quantity)
    if (!item) {
      toast.error('Selecciona un artículo')
      return
    }
    if (!(enteredQuantity > 0)) {
      toast.error('La cantidad debe ser mayor que cero')
      return
    }
    const movementQuantity = item.inventory_kind === 'filament' && movementForm.quantity_unit === 'spool'
      ? enteredQuantity * Number(item.grams_per_spool)
      : enteredQuantity
    if (!(movementQuantity > 0)) {
      toast.error('Este filamento no tiene un peso por spool válido')
      return
    }
    const projectedStock = Number(item.current_stock || 0) + movementQuantity * movementDirection
    if (projectedStock < 0) {
      toast.error(`Solo hay ${inventoryAmount(item, item.current_stock)} disponibles. Revisa la cantidad de salida.`)
      return
    }
    const isPurchase = movementForm.movement_type === 'purchase'
    const costError = isPurchase ? purchaseCostError(movementForm, { required: true }) : null
    if (costError) {
      toast.error(costError)
      return
    }

    setSaving(true)
    try {
      const { error } = await addInventoryMovement({
        inventory_item_id: item.id,
        movement_type: movementForm.movement_type,
        quantity_delta: movementQuantity * movementDirection,
        unit_cost: isPurchase || movementForm.unit_cost === '' ? null : Number(movementForm.unit_cost),
        ...(isPurchase
          ? purchaseMovementCost(movementForm)
          : { purchase_cost: null, delivery_cost: 0 }),
        note: movementForm.note.trim() || null,
      }, currentBusinessId)
      if (error) throw error
      toast.success('Inventario actualizado')
      resetMovementForm()
      loadInventory()
    } catch (error) {
      toast.error(`No se pudo registrar: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (checkingAuth) return <Loading />
  if (!user) return <AdminLogin onLogin={(authenticatedUser) => setUser(authenticatedUser)} />
  if (!currentBusinessId) return <Loading />

  return (
    <div className='min-h-screen bg-gray-50 py-6'>
      <div className='mx-auto max-w-6xl px-4'>
        <div className='admin-page-header mb-5 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-gray-400'>{currentBusiness?.name}</p>
            <h1 className='text-xl font-bold text-gray-800'>Inventario</h1>
            <p className='mt-0.5 text-sm text-gray-500'>{isHikari ? 'Filamentos por color, existencias e historial de entradas y salidas.' : 'Artículos, existencias e historial de entradas y salidas.'}</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <button onClick={() => openMovement()} disabled={!activeItems.length} className='rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'>
              + Actualizar stock
            </button>
            {isHikari && <button onClick={openCreateFilament} className='rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90' style={{ backgroundColor: currentBusiness?.primary_color || '#B08A3C' }}>
              + Filamento
            </button>}
            <button onClick={openCreateItem} className='rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90' style={{ backgroundColor: currentBusiness?.primary_color || '#B08A3C' }}>
              {isHikari ? '+ Otro artículo' : '+ Nuevo artículo'}
            </button>
          </div>
        </div>

        <div className='mb-5 grid gap-3 sm:grid-cols-3'>
          <Stat label='Artículos activos' value={items.filter((item) => item.is_active).length} />
          <Stat label='Bajo stock' value={lowStockCount} danger={lowStockCount > 0} />
          <Stat label='Invertido en stock' value={money(totalValue)} help='Existencia × costo promedio' />
        </div>

        <div className='mb-4 flex flex-wrap gap-2'>
          {[
            ['active', 'Activos'],
            ['low', `Bajo stock${lowStockCount ? ` (${lowStockCount})` : ''}`],
            ['all', 'Todos'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === value ? 'text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}
              style={filter === value ? { backgroundColor: currentBusiness?.primary_color || '#B08A3C' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <Panel>Cargando inventario...</Panel>
        ) : visibleItems.length === 0 ? (
          <Panel>
            {filter === 'low' ? 'No hay artículos con alerta de bajo stock.' : 'Aún no hay artículos. Registra materiales, piezas terminadas o insumos para este negocio.'}
          </Panel>
        ) : (
          <div className='overflow-hidden rounded-2xl bg-white shadow-soft'>
            <div className='divide-y divide-gray-100 sm:hidden'>
              {visibleItems.map((item) => (
                <article key={item.id} className={`p-4 ${!item.is_active ? 'opacity-55' : ''}`}>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <div className='flex items-center gap-2'>
                        {itemColorName(item) && <span aria-hidden='true' className='h-6 w-6 shrink-0 rounded-full border border-black/15 shadow-inner' style={{ background: inventoryColor(itemColorName(item)) }} />}
                        <h2 className='truncate font-bold text-gray-800'>{item.name}</h2>
                      </div>
                      <p className='mt-1 text-xs text-gray-400'>{item.inventory_kind === 'filament' ? `${item.filament_material} · ${item.filament_color}` : `${ITEM_TYPES[item.item_type]}${item.variant_color ? ` · Color: ${item.variant_color}` : ''}`}</p>
                    </div>
                    {!item.is_active ? <Badge tone='gray'>Inactivo</Badge> : item.is_low_stock ? <Badge tone='red'>Reponer</Badge> : <Badge tone='green'>Disponible</Badge>}
                  </div>
                  <div className='mt-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3'>
                    <div><p className='text-[11px] font-semibold uppercase tracking-wide text-gray-400'>Existencia</p><p className={`mt-1 font-bold ${item.is_low_stock && item.is_active ? 'text-red-600' : 'text-gray-800'}`}>{item.inventory_kind === 'filament' ? filamentAmount(item.current_stock, item.grams_per_spool) : `${amount(item.current_stock)} ${item.unit}`}</p></div>
                    <div><p className='text-[11px] font-semibold uppercase tracking-wide text-gray-400'>Costo promedio</p><p className='mt-1 font-bold text-gray-800'>{money(item.unit_cost)}</p></div>
                  </div>
                  <div className='mt-3 grid grid-cols-2 gap-2'>
                    <button onClick={() => openMovement(item)} disabled={!item.is_active} className='min-h-10 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40'>Actualizar stock</button>
                    <button onClick={() => item.inventory_kind === 'filament' ? openEditFilament(item) : openEditItem(item)} className='min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50'>Editar</button>
                    <button onClick={() => confirmRemoval(item)} className='col-span-2 min-h-10 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50'>Eliminar del inventario</button>
                  </div>
                </article>
              ))}
            </div>
            <div className='hidden overflow-x-auto sm:block'>
              <table className='min-w-full text-left text-sm'>
                <thead className='border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400'>
                  <tr>
                    <th className='px-4 py-3 font-semibold'>Artículo</th>
                    <th className='px-4 py-3 font-semibold'>Tipo</th>
                    <th className='px-4 py-3 font-semibold'>Stock</th>
                    <th className='px-4 py-3 font-semibold'>Costo promedio</th>
                    <th className='px-4 py-3 font-semibold'>Estado</th>
                    <th className='px-4 py-3 font-semibold' aria-label='Acciones' />
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-100'>
                  {visibleItems.map((item) => (
                    <tr key={item.id} className={!item.is_active ? 'opacity-55' : ''}>
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-2'>
                          {itemColorName(item) && <span aria-hidden='true' className='h-5 w-5 shrink-0 rounded-full border border-black/15 shadow-inner' style={{ background: inventoryColor(itemColorName(item)) }} />}
                          <p className='font-semibold text-gray-800'>{item.name}</p>
                        </div>
                        <p className='mt-0.5 text-xs text-gray-400'>{item.inventory_kind === 'filament' ? `${item.filament_material} · Color: ${item.filament_color}` : generalItemDetail(item)}</p>
                      </td>
                      <td className='px-4 py-3 text-gray-600'>{ITEM_TYPES[item.item_type]}</td>
                      <td className='px-4 py-3'>
                        <span className={`font-semibold ${item.is_low_stock && item.is_active ? 'text-red-600' : 'text-gray-800'}`}>
                          {item.inventory_kind === 'filament' ? filamentAmount(item.current_stock, item.grams_per_spool) : `${amount(item.current_stock)} ${item.unit}`}
                        </span>
                        <p className='mt-0.5 text-xs text-gray-400'>Mínimo: {item.inventory_kind === 'filament' ? filamentAmount(item.low_stock_threshold, item.grams_per_spool) : amount(item.low_stock_threshold)}</p>
                      </td>
                      <td className='px-4 py-3 text-gray-600'>{money(item.unit_cost)}</td>
                      <td className='px-4 py-3'>
                        {!item.is_active ? <Badge tone='gray'>Inactivo</Badge> : item.is_low_stock ? <Badge tone='red'>Reponer</Badge> : <Badge tone='green'>Disponible</Badge>}
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex flex-wrap justify-end gap-2'>
                          <button onClick={() => openMovement(item)} disabled={!item.is_active} className='rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40'>Actualizar stock</button>
                          <button onClick={() => item.inventory_kind === 'filament' ? openEditFilament(item) : openEditItem(item)} className='rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50'>Editar</button>
                          <button onClick={() => confirmRemoval(item)} className='rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50'>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <section className='mt-6 overflow-hidden rounded-2xl bg-white shadow-soft'>
          <div className='flex items-center justify-between border-b border-gray-100 px-5 py-4'>
            <div>
              <h2 className='font-bold text-gray-800'>Historial de inventario</h2>
              <p className='text-xs text-gray-400'>Muestra cada entrada y salida. Los errores se corrigen con un ajuste.</p>
            </div>
          </div>
          {movements.length === 0 ? (
            <p className='p-5 text-sm text-gray-400'>Todavía no hay entradas ni salidas.</p>
          ) : (
            <div className='divide-y divide-gray-100'>
              {movements.map((movement) => {
                const item = itemById.get(movement.inventory_item_id)
                const entering = Number(movement.quantity_delta) > 0
                return (
                  <div key={movement.id} className='flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm'>
                    <div className='min-w-44 flex-1'>
                      <p className='font-semibold text-gray-700'>{item?.name || 'Artículo eliminado'}{item?.variant_color ? ` · ${item.variant_color}` : ''}</p>
                      <p className='text-xs text-gray-400'>{new Date(movement.occurred_at).toLocaleString('es-NI', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                    </div>
                    <span className='text-gray-500'>{MOVEMENT_TYPES[movement.movement_type]}</span>
                    <span className={`font-bold ${entering ? 'text-emerald-600' : 'text-red-600'}`}>
                      {entering ? '+' : ''}{item?.inventory_kind === 'filament' ? filamentAmount(movement.quantity_delta, item.grams_per_spool) : `${amount(movement.quantity_delta)} ${item?.unit || ''}`}
                    </span>
                    <MovementCost movement={movement} />
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {showFilamentForm && (
        <Modal title={editingFilament ? 'Editar filamento' : 'Registrar filamento'} onClose={resetFilamentForm}>
          <form onSubmit={saveFilament} className='space-y-4'>
            <p className='rounded-xl bg-sky-50 p-3 text-sm text-sky-900'>{editingFilament ? 'Corrige el color, material, peso del spool o alerta. La existencia y el costo acumulado no se alteran.' : 'Cada color queda como un artículo separado. El sistema guarda gramos para que puedas descontar lo usado en cada impresión, aunque lo registres por spools.'}</p>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='sm:col-span-2'>
                <label htmlFor='filament-color' className='mb-1.5 block text-xs font-medium text-gray-600'>Color</label>
                <ColorPicker id='filament-color' required value={filamentForm.color} onChange={(color) => setFilamentForm((current) => ({ ...current, color }))} />
              </div>
              <Field label='Material'><input required list='filament-materials' value={filamentForm.material} onChange={(event) => setFilamentForm({ ...filamentForm, material: event.target.value })} placeholder='PLA' className='field' /><datalist id='filament-materials'>{FILAMENT_MATERIALS.map((material) => <option key={material} value={material} />)}</datalist></Field>
              {!editingFilament && <Field label={`Cantidad recibida (${FILAMENT_UNITS[filamentForm.quantity_unit]})`}><input required type='number' min='0.001' step='0.001' value={filamentForm.quantity} onChange={(event) => setFilamentForm({ ...filamentForm, quantity: event.target.value })} placeholder={filamentForm.quantity_unit === 'spool' ? 'Ej. 2' : 'Ej. 2000'} className='field' /></Field>}
              <Field label={editingFilament ? 'Unidad para la alerta' : 'La cantidad está en'}><select value={filamentForm.quantity_unit} onChange={(event) => changeFilamentUnit(event.target.value)} className='field'><option value='spool'>Spools</option><option value='g'>Gramos</option></select></Field>
              <Field label='Gramos por spool'><input required type='number' min='0.001' step='0.001' value={filamentForm.grams_per_spool} onChange={(event) => setFilamentForm({ ...filamentForm, grams_per_spool: event.target.value })} placeholder='1000' className='field' /></Field>
              <Field label={`Alerta bajo stock (${FILAMENT_UNITS[filamentForm.quantity_unit]})`}><input type='number' min='0' step='0.001' value={filamentForm.low_stock_quantity} onChange={(event) => setFilamentForm({ ...filamentForm, low_stock_quantity: event.target.value })} placeholder={filamentForm.quantity_unit === 'spool' ? 'Ej. 0.5' : 'Ej. 250'} className='field' /></Field>
              {!editingFilament && <><PurchaseCostFields form={filamentForm} setForm={setFilamentForm} unitLabel={filamentForm.quantity_unit === 'spool' ? 'spool' : 'gramo'} />
              <div className='rounded-xl bg-sky-50 p-3 text-sm text-sky-900 sm:col-span-2'>
                <p className='font-semibold'>Existencia inicial: {filamentAmount(filamentForm.quantity_unit === 'spool' ? Number(filamentForm.quantity || 0) * Number(filamentForm.grams_per_spool || 0) : Number(filamentForm.quantity || 0), filamentForm.grams_per_spool)}</p>
                {filamentForm.purchase_cost !== '' && <><PurchaseConversion form={filamentForm} className='text-sky-800' /><p className='mt-1 font-semibold'>Costo puesto en Nicaragua: {money(filamentLandedCost.totalNio)}</p><p className='mt-0.5 text-xs text-sky-800'>Costo por gramo: {preciseMoney(filamentLandedCost.totalNio / ((filamentForm.quantity_unit === 'spool' ? Number(filamentForm.quantity || 0) * Number(filamentForm.grams_per_spool || 0) : Number(filamentForm.quantity || 0)) || 1))}</p>{filamentForm.quantity_unit === 'spool' && <p className='mt-0.5 text-xs text-sky-800'>Costo por spool: {money(filamentLandedCost.totalNio / (Number(filamentForm.quantity) || 1))}</p>}</>}
              </div></>}
              <SuggestedTextField
                id='filament-supplier'
                className='sm:col-span-2'
                label='Proveedor'
                value={filamentForm.supplier_name}
                onChange={(supplier_name) => setFilamentForm((current) => ({ ...current, supplier_name }))}
                options={supplierOptions}
                quickOptions={DEFAULT_SUPPLIER_OPTIONS}
                placeholder='Ej. Amazon, Temu o proveedor local'
                help='Elige uno, busca un proveedor ya usado en este negocio o escribe uno nuevo.'
              />
              <Field className='sm:col-span-2' label='Notas'><textarea rows={2} value={filamentForm.notes} onChange={(event) => setFilamentForm({ ...filamentForm, notes: event.target.value })} placeholder='Marca, acabado, lote...' className='field' /></Field>
            </div>
            <FormActions onCancel={resetFilamentForm} saving={saving} label={editingFilament ? 'Guardar cambios' : 'Agregar filamento'} color={currentBusiness?.primary_color} />
          </form>
        </Modal>
      )}

      {showItemForm && (
        <Modal title={editingItem ? 'Editar artículo' : 'Nuevo artículo'} onClose={resetItemForm}>
          <form onSubmit={saveItem} className='space-y-4'>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <Field className='sm:col-span-2' label='Nombre'><input required value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} className='field' /></Field>
              <Field label='Código / SKU'><input value={itemForm.sku} onChange={(event) => setItemForm({ ...itemForm, sku: event.target.value })} className='field' /></Field>
              <Field label='Tipo'><select value={itemForm.item_type} onChange={(event) => setItemForm({ ...itemForm, item_type: event.target.value })} className='field'>{Object.entries(ITEM_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <div className='sm:col-span-2'>
                <label htmlFor='inventory-item-color' className='mb-1.5 block text-xs font-medium text-gray-600'>Color (opcional)</label>
                <ColorPicker id='inventory-item-color' value={itemForm.color} onChange={(color) => setItemForm((current) => ({ ...current, color }))} />
              </div>
              <SuggestedTextField
                id='inventory-item-unit'
                label='Unidad de medida'
                value={itemForm.unit}
                onChange={(unit) => setItemForm((current) => ({ ...current, unit }))}
                options={unitOptions}
                quickOptions={QUICK_UNIT_OPTIONS}
                placeholder='Elige o escribe otra unidad'
                help='Así contarás el stock. Ej.: 24 placas = unidad; 6 pares de aretes = par.'
                required
              />
              {!editingItem && <>
                <Field label='Cantidad que recibiste'><input type='number' min='0' step='0.001' value={itemForm.opening_quantity} onChange={(event) => setItemForm({ ...itemForm, opening_quantity: event.target.value })} placeholder='Ej. 100' className='field' /></Field>
                <PurchaseCostFields form={itemForm} setForm={setItemForm} unitLabel={itemForm.unit || 'unidad'} />
                {itemForm.purchase_cost !== '' && <div className='rounded-xl bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2'><p className='mb-1 font-semibold'>Compra: {amount(itemForm.opening_quantity)} {itemForm.unit || 'unidad'}</p><PurchaseConversion form={itemForm} /><p className='mt-1 font-semibold'>Costo puesto en Nicaragua: {money(itemLandedCost.totalNio)}</p><p className='mt-0.5 text-xs text-amber-800'>Costo por {itemForm.unit || 'unidad'}: {money(itemLandedCost.totalNio / (Number(itemForm.opening_quantity) || 1))}</p><p className='mt-1 text-xs text-amber-800'>Incluye el delivery y se registrará como tu primera compra.</p></div>}
              </>}
              <Field label='Alerta bajo stock'><input type='number' min='0' step='0.001' value={itemForm.low_stock_threshold} onChange={(event) => setItemForm({ ...itemForm, low_stock_threshold: event.target.value })} placeholder='0' className='field' /></Field>
              {(editingItem || itemForm.purchase_cost === '') && <Field label={editingItem ? 'Costo promedio actual (C$)' : 'Costo por unidad manual (opcional)'}><input type='number' min='0' step='0.0001' value={itemForm.unit_cost} onChange={(event) => setItemForm({ ...itemForm, unit_cost: event.target.value })} placeholder='0' className='field' /></Field>}
              <SuggestedTextField
                id='inventory-item-supplier'
                className='sm:col-span-2'
                label='Proveedor'
                value={itemForm.supplier_name}
                onChange={(supplier_name) => setItemForm((current) => ({ ...current, supplier_name }))}
                options={supplierOptions}
                quickOptions={DEFAULT_SUPPLIER_OPTIONS}
                placeholder='Ej. Amazon, Temu o proveedor local'
                help='Proveedor es quien te vendió el artículo. El courier se registra aparte como delivery.'
              />
              <Field className='sm:col-span-2' label='Notas'><textarea rows={2} value={itemForm.notes} onChange={(event) => setItemForm({ ...itemForm, notes: event.target.value })} className='field' /></Field>
              {editingItem && <label className='flex items-center gap-2 text-sm text-gray-600 sm:col-span-2'><input type='checkbox' checked={itemForm.is_active} onChange={(event) => setItemForm({ ...itemForm, is_active: event.target.checked })} />Activo en inventario</label>}
            </div>
            <FormActions onCancel={resetItemForm} saving={saving} label={editingItem ? 'Guardar cambios' : 'Agregar artículo'} color={currentBusiness?.primary_color} />
          </form>
        </Modal>
      )}

      {showMovementForm && (
        <Modal title='Actualizar stock' onClose={() => !saving && resetMovementForm()}>
          <form onSubmit={saveMovement} className='space-y-4'>
            <div id='movement-same-item-help' className='rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900'>
              <p className='font-semibold'>¿Llegaron más unidades del mismo artículo?</p>
              <p className='mt-1 text-xs leading-relaxed text-sky-800'>Usa <strong>Entrada → Reponer</strong>. Sumaremos las nuevas unidades y actualizaremos el costo promedio. El producto, color, modelo, presentación y SKU deben coincidir.</p>
              <div className={`mt-3 grid gap-2 ${isHikari ? 'grid-cols-2' : ''}`}>
                {isHikari && <button type='button' disabled={saving} onClick={() => openDifferentItemFromMovement('filament')} className='rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50'>Nuevo filamento</button>}
                <button type='button' disabled={saving} onClick={() => openDifferentItemFromMovement('item')} className='rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50'>
                  {isHikari ? 'Otro artículo' : '¿Es diferente? Registrar artículo nuevo'}
                </button>
              </div>
            </div>

            <section className='space-y-3'>
              <FormStep number='1' title='Artículo existente' description='El stock se actualizará únicamente en este registro.' />
              <label htmlFor='movement-item' className='block'>
                <span className='mb-1.5 block text-xs font-medium text-gray-600'>Selecciona el artículo</span>
                <select id='movement-item' required disabled={saving} aria-describedby='movement-same-item-help' value={movementForm.inventory_item_id} onChange={(event) => {
                  const item = itemById.get(event.target.value)
                  setMovementForm({
                    ...movementFormInitial,
                    inventory_item_id: event.target.value,
                    movement_type: movementForm.movement_type,
                    adjustment_direction: movementForm.adjustment_direction,
                    unit_cost: item?.unit_cost ?? '',
                    quantity_unit: item?.inventory_kind === 'filament' ? 'spool' : 'g',
                  })
                }} className='field'>
                  <option value=''>Selecciona un artículo</option>
                  {activeItems.map((item) => <option key={item.id} value={item.id}>{item.name}{item.variant_color ? ` · ${item.variant_color}` : ''} · {inventoryAmount(item, item.current_stock)}</option>)}
                </select>
              </label>

              {movementItem && (
                <div className='rounded-xl border border-gray-200 bg-gray-50 p-3'>
                  <div className='flex items-start gap-3'>
                    {itemColorName(movementItem) && <span aria-hidden='true' className='mt-0.5 h-8 w-8 shrink-0 rounded-full border border-black/15 shadow-inner' style={{ background: inventoryColor(itemColorName(movementItem)) }} />}
                    <div className='min-w-0 flex-1'>
                      <p className='break-words text-sm font-bold text-gray-800'>{movementItem.name}</p>
                      <p className='mt-0.5 break-words text-xs text-gray-500'>{movementIsFilament ? `${movementItem.filament_material} · Color: ${movementItem.filament_color}` : generalItemDetail(movementItem)}</p>
                    </div>
                  </div>
                  <div className='mt-3 grid grid-cols-2 gap-2 border-t border-gray-200 pt-3 text-xs'>
                    <div><p className='text-gray-400'>Existencia actual</p><p className='mt-0.5 font-bold text-gray-800'>{inventoryAmount(movementItem, movementItem.current_stock)}</p></div>
                    <div><p className='text-gray-400'>Costo promedio</p><p className='mt-0.5 font-bold text-gray-800'>{movementIsFilament ? preciseMoney(movementItem.unit_cost) : money(movementItem.unit_cost)}</p></div>
                  </div>
                </div>
              )}
            </section>

            {movementItem ? (
              <>
            <section className='space-y-3 border-t border-gray-100 pt-4'>
              <FormStep number='2' title='Movimiento' description='Entrada suma compras o devoluciones; salida descuenta ventas o artículos usados.' />
              <div className='grid grid-cols-3 gap-2' role='group' aria-label='Dirección del movimiento'>
                {STOCK_FLOW_OPTIONS.map((option) => {
                  const selected = movementFlow === option.value
                  return (
                    <button key={option.value} type='button' disabled={saving} aria-pressed={selected} onClick={() => changeMovementFlow(option.value)} className={`min-h-14 rounded-xl border px-2 py-2 text-center transition-colors disabled:opacity-50 ${selected ? 'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                      <span className='block text-xs font-bold'>{option.label}</span>
                      <span className='mt-0.5 block text-[10px] leading-tight opacity-75'>{option.description}</span>
                    </button>
                  )
                })}
              </div>

              {movementFlow === 'adjustment' ? (
                <div>
                  <p className='mb-1.5 text-xs font-medium text-gray-600'>¿Cómo corregirás el conteo?</p>
                  <div className='grid grid-cols-2 gap-2' role='group' aria-label='Dirección de la corrección'>
                    {[['in', 'Sumar stock'], ['out', 'Restar stock']].map(([value, label]) => {
                      const selected = movementForm.adjustment_direction === value
                      return <button key={value} type='button' disabled={saving} aria-pressed={selected} onClick={() => changeAdjustmentDirection(value)} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors disabled:opacity-50 ${selected ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{label}</button>
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <p className='mb-1.5 text-xs font-medium text-gray-600'>Motivo de la {movementFlow === 'in' ? 'entrada' : 'salida'}</p>
                  <div className='grid grid-cols-2 gap-2' role='group' aria-label={`Motivo de la ${movementFlow === 'in' ? 'entrada' : 'salida'}`}>
                    {movementReasonActions.map((action) => {
                      const selected = movementForm.movement_type === action.value
                      return (
                        <button key={action.value} type='button' disabled={saving} aria-pressed={selected} onClick={() => changeMovementAction(action.value)} className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${selected ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                          <span className='flex items-center justify-between gap-2 text-xs font-bold'><span>{action.label}</span><span className={action.directionClass}>{action.directionLabel}</span></span>
                          <span className='mt-1 block text-[10px] leading-relaxed opacity-75'>{action.description}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className='space-y-3 border-t border-gray-100 pt-4'>
              <FormStep number='3' title='Cantidad y detalles' description='Revisa la existencia resultante antes de guardar.' />
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <Field label={movementQuantityLabel}><input required type='number' min='0.001' step='0.001' value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: event.target.value })} placeholder='Ej. 10' className='field' /></Field>
                {movementIsFilament && <Field label='Registrar como'><select value={movementForm.quantity_unit} onChange={(event) => changeMovementQuantityUnit(event.target.value)} className='field'><option value='spool'>Spools</option><option value='g'>Gramos</option></select></Field>}

                {movementProjectedStock !== null && (
                  <div aria-live='polite' className={`rounded-xl border p-3 text-sm sm:col-span-2 ${movementProjectedStock < 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                    <p className='text-xs font-medium opacity-80'>Existencia después de registrar</p>
                    <p className='mt-1 font-bold'>{inventoryAmount(movementItem, movementItem.current_stock)} {movementDirection > 0 ? '+' : '−'} {inventoryAmount(movementItem, Math.abs(movementQuantityInStockUnit))} = {inventoryAmount(movementItem, movementProjectedStock)}</p>
                    {movementProjectedStock < 0 && <p className='mt-1 text-xs'>No puedes registrar una salida mayor que la existencia disponible.</p>}
                  </div>
                )}

                {movementForm.movement_type === 'purchase' ? (
                  <>
                    <PurchaseCostFields form={movementForm} setForm={setMovementForm} unitLabel={movementIsFilament ? movementForm.quantity_unit === 'spool' ? 'spool' : 'gramo' : movementItem?.unit || 'unidad'} purchaseRequired />
                    <div className='rounded-xl bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2'>
                      <PurchaseConversion form={movementForm} />
                      <p className='mt-1 font-semibold'>Costo puesto en Nicaragua: {money(movementLandedCost.totalNio)}</p>
                      <p className='mt-0.5 text-xs text-amber-800'>Costo por {movementItem?.unit || 'unidad'}: {movementIsFilament ? preciseMoney(movementLandedCost.totalNio / (movementQuantityInStockUnit || 1)) : money(movementLandedCost.totalNio / (movementQuantityInStockUnit || 1))}</p>
                      {movementIsFilament && movementForm.quantity_unit === 'spool' && <p className='mt-0.5 text-xs text-amber-800'>Costo por spool: {money(movementLandedCost.totalNio / (Number(movementForm.quantity) || 1))}</p>}
                    </div>
                  </>
                ) : null}
                <Field className='sm:col-span-2' label='Nota (opcional)'><textarea rows={2} value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} placeholder={movementAction.notePlaceholder} className='field' /></Field>
              </div>
            </section>
              </>
            ) : (
              <div className='rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500'>Selecciona un artículo existente para indicar si entró, se vendió o se usó.</div>
            )}
            <FormActions onCancel={resetMovementForm} saving={saving} disabled={!movementItem} label={movementSubmitLabel} color={currentBusiness?.primary_color} />
          </form>
        </Modal>
      )}

      {removalTarget && (
        <Modal title='Eliminar artículo permanentemente' onClose={() => !removing && setRemovalTarget(null)}>
          <div className='space-y-4'>
            <div>
              <p className='font-semibold text-gray-800'>¿Eliminar “{removalTarget.name}{removalTarget.variant_color ? ` · ${removalTarget.variant_color}` : ''}” y todo su historial?</p>
              <p className='mt-2 text-sm leading-relaxed text-gray-500'>Se eliminarán permanentemente el artículo y todas sus entradas y salidas. Esta acción no se puede deshacer.</p>
            </div>
            {Number(removalTarget.current_stock || 0) !== 0 && (
              <div className='rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'>
                <p className='font-semibold'>Existencia actual: {removalTarget.inventory_kind === 'filament' ? filamentAmount(removalTarget.current_stock, removalTarget.grams_per_spool) : `${amount(removalTarget.current_stock)} ${removalTarget.unit}`}</p>
                <p className='mt-1 text-xs leading-relaxed'>Al eliminar, esta existencia y su valor desaparecerán del inventario; no se registrará una salida.</p>
              </div>
            )}
            <div className='admin-modal-footer -mx-5 -mb-5 flex flex-col-reverse gap-3 border-t border-gray-100 bg-white p-5 sm:flex-row'>
              <button type='button' disabled={removing} onClick={() => setRemovalTarget(null)} className='w-full rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:w-auto'>Cancelar</button>
              <button type='button' disabled={removing} onClick={removeItem} className='w-full rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 sm:flex-1'>{removing ? 'Eliminando...' : 'Eliminar permanentemente'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PurchaseCostFields({ form, setForm, unitLabel = 'unidad', purchaseRequired = false }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const costMode = form.purchase_cost_mode || 'total'
  const quantity = purchaseQuantity(form)
  const calculatedTotal = purchaseOriginalTotal(form)

  const changeCostMode = (nextMode) => {
    setForm((current) => {
      const currentMode = current.purchase_cost_mode || 'total'
      if (currentMode === nextMode) return current

      const currentCost = Number(current.purchase_cost)
      const currentQuantity = purchaseQuantity(current)
      if (current.purchase_cost === '' || !Number.isFinite(currentCost) || !(currentQuantity > 0)) {
        return { ...current, purchase_cost_mode: nextMode }
      }

      const convertedCost = nextMode === 'unit'
        ? currentCost / currentQuantity
        : currentCost * currentQuantity
      const precision = nextMode === 'unit' ? 6 : 2
      const factor = 10 ** precision
      const purchaseCost = String(Math.round((convertedCost + Number.EPSILON) * factor) / factor)
      return { ...current, purchase_cost_mode: nextMode, purchase_cost: purchaseCost }
    })
  }

  return (
    <>
      <div className='sm:col-span-2'>
        <p className='mb-1.5 text-xs font-medium text-gray-600'>¿Cómo tienes el precio?</p>
        <div className='grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-1' role='group' aria-label='Forma de ingresar el costo de la compra'>
          {[
            ['total', 'Precio total'],
            ['unit', 'Precio por unidad'],
          ].map(([value, label]) => (
            <button
              key={value}
              type='button'
              aria-pressed={costMode === value}
              onClick={() => changeCostMode(value)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${costMode === value ? 'bg-white text-amber-900 shadow-sm ring-1 ring-amber-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className='mt-1 text-[11px] leading-relaxed text-gray-400'>{costMode === 'unit' ? 'Escribe lo que pagaste por cada unidad; multiplicaremos por la cantidad.' : 'Escribe lo que pagaste por todas las unidades juntas.'}</p>
      </div>
      <Field label={costMode === 'unit' ? `Precio por ${unitLabel}` : 'Costo total de la compra'}>
        <div className='grid grid-cols-[minmax(0,1fr)_7rem] gap-2'>
          <input required={purchaseRequired} type='number' min='0' step={costMode === 'unit' ? '0.000001' : '0.01'} value={form.purchase_cost} onChange={(event) => update('purchase_cost', event.target.value)} placeholder={costMode === 'unit' ? form.purchase_currency === 'USD' ? 'Ej. 3' : 'Ej. 110' : form.purchase_currency === 'USD' ? 'Ej. 18' : 'Ej. 660'} className='field' />
          <select value={form.purchase_currency} onChange={(event) => update('purchase_currency', event.target.value)} className='field' aria-label='Moneda del costo de la compra'>
            <option value='USD'>US$</option>
            <option value='NIO'>C$</option>
          </select>
        </div>
        {costMode === 'unit' && (
          <span className='mt-1 block text-[11px] leading-relaxed text-gray-400'>
            {quantity > 0 && form.purchase_cost !== ''
              ? `Subtotal: ${amount(quantity)} × ${originalUnitMoney(form.purchase_cost, form.purchase_currency)} = ${originalMoney(calculatedTotal, form.purchase_currency)}`
              : 'Completa la cantidad y el precio para ver el total.'}
          </span>
        )}
      </Field>
      <Field label='Delivery hasta Nicaragua'>
        <div className='grid grid-cols-[minmax(0,1fr)_7rem] gap-2'>
          <input type='number' min='0' step='0.01' value={form.delivery_cost} onChange={(event) => update('delivery_cost', event.target.value)} placeholder={form.delivery_currency === 'USD' ? 'Ej. 5' : 'Ej. 300'} className='field' />
          <select value={form.delivery_currency} onChange={(event) => update('delivery_currency', event.target.value)} className='field' aria-label='Moneda del delivery'>
            <option value='USD'>US$</option>
            <option value='NIO'>C$</option>
          </select>
        </div>
      </Field>
      {hasUsdCurrency(form) && (
        <div className='rounded-xl border border-gray-200 bg-gray-50 p-3 sm:col-span-2'>
          <p className='text-xs font-medium text-gray-600'>Tasa de cambio fija</p>
          <p className='mt-0.5 font-bold text-gray-800'>US$1 = C$ {exchangeRate(FIXED_EXCHANGE_RATE_TO_NIO)}</p>
          <p className='mt-1 text-[11px] text-gray-400'>Se aplica automáticamente y no se puede modificar.</p>
        </div>
      )}
    </>
  )
}

function PurchaseConversion({ form, className = 'text-amber-800' }) {
  const cost = landedCost(form)
  return (
    <div className={`space-y-0.5 text-xs ${className}`}>
      <p>Artículos (total): {originalMoney(cost.purchaseOriginal, form.purchase_currency)}{form.purchase_currency === 'USD' ? ` → ${money(cost.purchaseNio)}` : ''}</p>
      <p>Delivery: {originalMoney(cost.deliveryOriginal, form.delivery_currency)}{form.delivery_currency === 'USD' ? ` → ${money(cost.deliveryNio)}` : ''}</p>
      {usesUsd(form) && <p>Tasa fija: US$1 = C$ {exchangeRate(cost.exchangeRate)}</p>}
    </div>
  )
}

function MovementCost({ movement }) {
  if (movement.purchase_cost == null) {
    return <span className='max-w-56 truncate text-xs text-gray-400'>{movement.note || '—'}</span>
  }

  const hasOriginal = movement.original_purchase_cost != null
  if (!hasOriginal) {
    return <span className='max-w-72 text-xs text-gray-400'>{money(movement.purchase_cost)} + delivery {money(movement.delivery_cost)}</span>
  }

  const purchaseCurrency = movement.purchase_currency || 'NIO'
  const deliveryCurrency = movement.delivery_currency || 'NIO'
  const convertedFromUsd = purchaseCurrency === 'USD' || deliveryCurrency === 'USD'

  return (
    <span className='max-w-80 text-xs text-gray-400'>
      <span className='block'>{originalMoney(movement.original_purchase_cost, purchaseCurrency)} + delivery {originalMoney(movement.original_delivery_cost, deliveryCurrency)}</span>
      {convertedFromUsd && <span className='block'>TC {exchangeRate(movement.exchange_rate_to_nio)} · puesto {money(Number(movement.purchase_cost) + Number(movement.delivery_cost || 0))}</span>}
    </span>
  )
}

function ColorPicker({ id, value, onChange, required = false }) {
  const selectedValue = String(value || '').trim().toLowerCase()

  return (
    <>
      <div className='mb-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2' role='group' aria-label='Colores rápidos'>
        {COLOR_OPTIONS.map(([name, color]) => {
          const selected = selectedValue === name.toLowerCase()
          return (
            <button
              key={name}
              type='button'
              aria-pressed={selected}
              onClick={() => onChange(name)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all ${selected ? 'border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-500' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
            >
              <span aria-hidden='true' className='h-4 w-4 shrink-0 rounded-full border border-black/15 shadow-inner' style={{ background: color }} />
              {name}
            </button>
          )
        })}
      </div>
      <div className='flex gap-2'>
        <input
          id={id}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder='Elige arriba o escribe otro color'
          className='field min-w-0 flex-1'
        />
        {!required && value && (
          <button type='button' onClick={() => onChange('')} className='shrink-0 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-500 hover:bg-gray-50'>Quitar</button>
        )}
      </div>
      <span className='mt-1 block text-[11px] leading-relaxed text-gray-400'>Para separar existencias, registra cada color como un artículo distinto.</span>
    </>
  )
}

function SuggestedTextField({ id, label, value, onChange, options, quickOptions = [], placeholder, help, required = false, className = '' }) {
  const selectedValue = String(value || '').toLowerCase()

  return (
    <div className={className}>
      <label htmlFor={id} className='mb-1.5 block text-xs font-medium text-gray-600'>{label}</label>
      {quickOptions.length > 0 && (
        <div className='mb-2 flex flex-wrap gap-1.5' role='group' aria-label={`Opciones rápidas para ${label.toLowerCase()}`}>
          {quickOptions.map((option) => {
            const selected = selectedValue === option.toLowerCase()
            return (
              <button
                key={option}
                type='button'
                aria-pressed={selected}
                onClick={() => onChange(option)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${selected ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {option}
              </button>
            )
          })}
        </div>
      )}
      <input
        id={id}
        required={required}
        list={`${id}-options`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className='field'
      />
      <datalist id={`${id}-options`}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
      {help && <span className='mt-1 block text-[11px] leading-relaxed text-gray-400'>{help}</span>}
    </div>
  )
}

function Field({ label, children, className = '' }) {
  return <label className={className}><span className='mb-1.5 block text-xs font-medium text-gray-600'>{label}</span>{children}</label>
}

function FormStep({ number, title, description }) {
  return (
    <div className='flex items-start gap-2.5'>
      <span aria-hidden='true' className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-600'>{number}</span>
      <div>
        <h3 className='text-sm font-bold text-gray-800'>{title}</h3>
        {description && <p className='mt-0.5 text-xs leading-relaxed text-gray-400'>{description}</p>}
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className='admin-modal-backdrop'>
      <div role='dialog' aria-modal='true' aria-labelledby='inventory-modal-title' className='admin-modal-panel max-w-lg bg-white'>
        <div className='admin-modal-header flex items-center justify-between border-b border-gray-100 p-5'><h2 id='inventory-modal-title' className='text-lg font-bold text-gray-800'>{title}</h2><button type='button' onClick={onClose} className='rounded-lg p-1 text-2xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-600' aria-label='Cerrar'>×</button></div>
        <div className='admin-modal-body p-5'>{children}</div>
      </div>
    </div>
  )
}

function FormActions({ onCancel, saving, disabled = false, label, color }) {
  return <div className='admin-modal-footer -mx-5 -mb-5 flex flex-col-reverse gap-3 border-t border-gray-100 bg-white p-5 sm:flex-row'><button type='button' disabled={saving} onClick={onCancel} className='w-full rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:w-auto'>Cancelar</button><button disabled={saving || disabled} className='w-full rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:flex-1' style={{ backgroundColor: color || '#B08A3C' }}>{saving ? 'Guardando...' : label}</button></div>
}

function Stat({ label, value, danger = false, help = '' }) {
  return <div className='rounded-2xl bg-white p-4 shadow-soft'><p className='text-xs font-semibold uppercase tracking-wide text-gray-400'>{label}</p><p className={`mt-1 text-xl font-bold ${danger ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>{help && <p className='mt-1 text-[11px] text-gray-400'>{help}</p>}</div>
}

function Panel({ children }) {
  return <div className='rounded-2xl bg-white p-10 text-center text-sm text-gray-400 shadow-soft'>{children}</div>
}

function Badge({ tone, children }) {
  const colors = { gray: 'bg-gray-100 text-gray-500', red: 'bg-red-50 text-red-600', green: 'bg-emerald-50 text-emerald-700' }
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>
}

function Loading() {
  return <div className='flex min-h-screen items-center justify-center bg-gray-50'><div className='h-12 w-12 animate-spin rounded-full border-b-2 border-[#B08A3C]' /></div>
}
