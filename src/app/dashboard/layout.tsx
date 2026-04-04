import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { DeployAgentButton } from '@/components/DeployAgentModal'

const DEV_NO_AUTH = process.env.DEV_NO_AUTH === 'true'

const nav = [
  { href: '/dashboard', label: 'Command Center', icon: 'dashboard' },
  { href: '/dashboard/activity', label: 'Live Activity', icon: 'timeline' },
  { href: '/dashboard/agents', label: 'My Agents', icon: 'precision_manufacturing' },
  { href: '/dashboard/contracts', label: 'Contracts', icon: 'history_edu' },
  { href: '/dashboard/credits', label: 'Credits', icon: 'account_balance_wallet' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'settings' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!DEV_NO_AUTH) {
    const { userId } = await auth()
    if (!userId) redirect('/sign-in')
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#e8eff3] flex flex-col fixed inset-y-0 left-0 z-20">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[#a9b4b9]/30">
          <span className="font-bold text-base text-[#2a3439] tracking-tight">CrewLink</span>
          <span className="block text-[9px] font-bold text-[#3E52D5] uppercase tracking-widest mt-0.5">
            Agent Marketplace
          </span>
          {DEV_NO_AUTH && (
            <span className="text-[9px] text-[#9e3f4e] font-bold uppercase tracking-widest block mt-1">
              dev mode
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 text-[#566166] text-sm font-medium rounded-l hover:bg-[#f7f9fb] hover:text-[#3E52D5] transition-colors group"
            >
              <span
                className="material-symbols-outlined text-[18px] text-[#566166] group-hover:text-[#3E52D5] transition-colors"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="px-5 py-4 border-t border-[#a9b4b9]/30">
          {!DEV_NO_AUTH && <UserButton afterSignOutUrl="/" />}
          {DEV_NO_AUTH && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#0053db] flex items-center justify-center text-[10px] font-bold text-white">
                A
              </div>
              <span className="text-xs text-[#566166]">Alice Dev</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-16 bg-[#f7f9fb] border-b border-[#a9b4b9]/20 sticky top-0 z-10 flex items-center px-8 gap-6">
          <span className="text-sm font-bold text-[#2a3439] tracking-tight mr-auto">CrewLink</span>
          <nav className="hidden md:flex items-center gap-5">
            <Link href="/dashboard/agents" className="text-[11px] font-semibold text-[#566166] uppercase tracking-widest hover:text-[#0053db] transition-colors">
              Marketplace
            </Link>
            <Link href="/dashboard/agents" className="text-[11px] font-semibold text-[#566166] uppercase tracking-widest hover:text-[#0053db] transition-colors">
              Agents
            </Link>
            <Link href="/dashboard/contracts" className="text-[11px] font-semibold text-[#566166] uppercase tracking-widest hover:text-[#0053db] transition-colors">
              Contracts
            </Link>
          </nav>
          <DeployAgentButton />
        </header>

        {/* Page content */}
        <main className="flex-1 bg-[#f7f9fb] overflow-auto">
          <div className="max-w-[1400px] mx-auto p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
