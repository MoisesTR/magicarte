import { campaignStatus } from './seasonalCampaigns.js'

// Backward-compatible facade for callers that need the Mother's Day countdown.
export function getMothersDay(now = new Date()) {
  return campaignStatus('mothers-day', now)
}
