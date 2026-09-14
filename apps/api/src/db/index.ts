import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'
import type { DB } from './schema'

export interface DatabaseBundle {
  db: Kysely<DB>
  d1: D1Database
}

export function createDb(d1: D1Database): DatabaseBundle {
  const db = new Kysely<DB>({ dialect: new D1Dialect({ database: d1 }) })
  return { db, d1 }
}
