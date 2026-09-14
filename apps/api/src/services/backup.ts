import type { Kysely } from 'kysely'
import type { DB } from '../db/schema'

export async function exportAll(db: Kysely<DB>) {
  const [
    users,
    products,
    skus,
    barcodes,
    priceHistory,
    purchases,
    purchaseItems,
    customers,
    orders,
    orderItems,
    payments,
    barcodeCache,
    settings,
  ] = await Promise.all([
    db
      .selectFrom('users')
      .select(['id', 'username', 'nickname', 'role', 'status', 'created_at'])
      .execute(),
    db.selectFrom('products').selectAll().execute(),
    db.selectFrom('skus').selectAll().execute(),
    db.selectFrom('barcodes').selectAll().execute(),
    db.selectFrom('price_history').selectAll().execute(),
    db.selectFrom('purchases').selectAll().execute(),
    db.selectFrom('purchase_items').selectAll().execute(),
    db.selectFrom('customers').selectAll().execute(),
    db.selectFrom('orders').selectAll().execute(),
    db.selectFrom('order_items').selectAll().execute(),
    db.selectFrom('payments').selectAll().execute(),
    db.selectFrom('barcode_cache').selectAll().execute(),
    db.selectFrom('settings').selectAll().execute(),
  ])

  return {
    exported_at: new Date().toISOString(),
    users,
    products,
    skus,
    barcodes,
    price_history: priceHistory,
    purchases,
    purchase_items: purchaseItems,
    customers,
    orders,
    order_items: orderItems,
    payments,
    barcode_cache: barcodeCache,
    settings,
  }
}
