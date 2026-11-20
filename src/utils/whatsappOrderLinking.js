import { matchThreadsToOrders, OPEN_STATUSES } from './whatsappFeed.js'

/** One load owns one sequential linking pass and at most one readback, never a recursive retry. */
export async function loadWhatsAppFeedWithOrders(
  businessId,
  { fetchFeed, fetchOrders, completeConversion, logger = console },
  sessionLinkedIds = new Set()
) {
  const [initialFeed, orders] = await Promise.all([
    fetchFeed(businessId),
    Promise.resolve()
      .then(() => fetchOrders(businessId))
      .catch((error) => {
        logger.warn('WhatsApp order matching unavailable', error)
        return []
      }),
  ])
  let feed = initialFeed
  const matches = matchThreadsToOrders(feed.threads || [], orders)
  const attempted = new Set(),
    linked = new Map()
  for (const thread of feed.threads || []) {
    const order = matches.get(thread.id)
    if (
      !order ||
      thread.order_id ||
      !OPEN_STATUSES.includes(thread.status) ||
      String(thread.business_id) !== String(businessId) ||
      attempted.has(thread.id)
    )
      continue
    attempted.add(thread.id)
    try {
      const result = await completeConversion(thread.id, order.id, businessId)
      if (result.error) throw result.error
      if (!result.data) throw new Error('Thread conversion returned no row')
      linked.set(thread.id, {
        ...thread,
        ...result.data,
        order_id: order.id,
        status: 'won',
      })
      sessionLinkedIds.add(thread.id)
    } catch (error) {
      logger.warn('WhatsApp phone auto-link failed', thread.id, error)
    }
  }
  if (attempted.size) {
    try {
      feed = await fetchFeed(businessId)
    } catch (error) {
      logger.warn('WhatsApp auto-link refresh failed', error)
      feed = {
        ...feed,
        threads: feed.threads.map((thread) => linked.get(thread.id) || thread),
      }
    }
  }
  return {
    ...feed,
    orders,
    orderMatches: matchThreadsToOrders(feed.threads || [], orders),
    autoLinkedThreadIds: [...sessionLinkedIds],
  }
}
