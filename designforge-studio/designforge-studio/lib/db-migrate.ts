import { sql } from './db'

/**
 * Database schema migration - adds missing columns to users table
 * This ensures compatibility between old schema and new auth system
 */

export async function migrateUsersTable(): Promise<void> {
  try {
    console.log('🔄 Checking users table schema...')

    // Check if password_hash column exists
    const hasPasswordHash = (await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password_hash'
      )
    `) as any[]

    if (hasPasswordHash && hasPasswordHash[0]?.exists === false) {
      console.log('  Adding password_hash column...')
      await sql`ALTER TABLE users ADD COLUMN password_hash TEXT`
    }

    // Check if role column exists
    const hasRole = (await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
      )
    `) as any[]

    if (hasRole && hasRole[0]?.exists === false) {
      console.log('  Adding role column...')
      await sql`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`
    }

    // Check if created_at column exists
    const hasCreatedAt = (await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'created_at'
      )
    `) as any[]

    if (hasCreatedAt && hasCreatedAt[0]?.exists === false) {
      console.log('  Adding created_at column...')
      await sql`ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW()`
    }

    console.log('✅ Users table schema is up to date')
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}
