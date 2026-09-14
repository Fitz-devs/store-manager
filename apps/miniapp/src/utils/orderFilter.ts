export type OrdersFilter = 'all' | 'unpaid' | 'pending'

let pendingFilter: OrdersFilter | null = null

export function setPendingOrdersFilter(filter: OrdersFilter): void {
  pendingFilter = filter
}

export function consumePendingOrdersFilter(): OrdersFilter | null {
  const value = pendingFilter
  pendingFilter = null
  return value
}
