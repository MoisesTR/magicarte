// Helpers for scoping queries/mutations to a business.
//
// The filter is only applied when a business id is known. Because all existing
// data belongs to Magic Arte, an unscoped query is equivalent today and becomes
// correctly scoped once the businesses list has loaded — so a missing id can
// never blank out the public site.

/** Build a useSupabaseQuery `filters` entry for business_id (empty when unknown). */
export function businessFilter(businessId) {
  return businessId != null ? [{ column: 'business_id', value: businessId }] : []
}

/** Merge a business_id filter into an existing filters array. */
export function withBusiness(filters = [], businessId) {
  return [...filters, ...businessFilter(businessId)]
}
