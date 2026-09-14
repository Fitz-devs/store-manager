import type { CompiledQuery } from 'kysely'

export async function batchCompiled(d1: D1Database, queries: CompiledQuery[]): Promise<void> {
  if (!queries.length) return
  const statements = queries.map((query) => d1.prepare(query.sql).bind(...(query.parameters as unknown[])))
  await d1.batch(statements)
}
