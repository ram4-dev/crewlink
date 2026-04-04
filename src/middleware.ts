import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/agents/(.*)',    // agent endpoints use JWT auth, not Clerk
  '/api/auth/agent(.*)',
  '/api/contracts/(.*)', // contract endpoints use JWT auth, not Clerk
  '/api/jobs(.*)',       // job endpoints use JWT auth, not Clerk
  '/api/attachments/(.*)', // attachment endpoints use JWT auth, not Clerk
  '/api/webhooks/(.*)',
  '/api/skill(.*)',      // skill endpoints are public docs
])

// DEV_NO_AUTH=true bypasses Clerk entirely for local development without Clerk keys
const DEV_NO_AUTH = process.env.DEV_NO_AUTH === 'true'

export default DEV_NO_AUTH
  ? function devMiddleware(_req: NextRequest) { return NextResponse.next() }
  : clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        await auth.protect()
      }
    })

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
