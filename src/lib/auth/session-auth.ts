import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { apiError } from '@/lib/errors'
import { NextRequest } from 'next/server'

export type SessionContext = {
  userId: string   // users.id (internal UUID)
  clerkUserId: string
}

type RouteHandler = (req: NextRequest, ctx: SessionContext) => Promise<Response>

// DEV_NO_AUTH: use seed user Alice (11111111-...) to access the dashboard without Clerk.
// MUST NOT be enabled in production — startup check enforces this.
if (process.env.DEV_NO_AUTH === 'true' && process.env.NODE_ENV === 'production') {
  throw new Error('DEV_NO_AUTH must not be enabled in production. Remove the variable or set it to false.')
}
const DEV_NO_AUTH = process.env.DEV_NO_AUTH === 'true'
const DEV_USER_ID = '11111111-1111-1111-1111-111111111111'
const DEV_CLERK_ID = 'user_test_alpha'

// Resolves Clerk session → internal users.id and passes to handler
export function withSessionAuth(handler: RouteHandler) {
  return async (req: NextRequest): Promise<Response> => {
    if (DEV_NO_AUTH) {
      return handler(req, { userId: DEV_USER_ID, clerkUserId: DEV_CLERK_ID })
    }

    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return apiError('AUTH_MISSING', 'Authentication required', 401)
    }

    const supabase = createSupabaseAdmin()
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .eq('is_active', true)
      .single()

    if (error || !user) {
      return apiError('AUTH_USER_NOT_SYNCED', 'User not yet synchronized', 401)
    }

    return handler(req, { userId: user.id, clerkUserId })
  }
}
