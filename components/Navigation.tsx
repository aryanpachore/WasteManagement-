'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Navigation() {
  const pathname = usePathname()

  const links = [
    { href: '/report', label: 'Report Waste' },
    { href: '/collect', label: 'Collect Waste' },
    { href: '/rewards', label: 'Rewards' },
    { href: '/leaderboard', label: 'Leaderboard' }
  ]

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium ${
                  pathname === link.href
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
} 