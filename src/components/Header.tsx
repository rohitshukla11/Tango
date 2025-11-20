'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export default function Header() {
  const pathname = usePathname()

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Upload', href: '/upload' },
    { name: 'Solvers', href: '/solvers' },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-dark/80 backdrop-blur-lg border-b border-white/10">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-lg blur group-hover:blur-lg transition-all" />
              <div className="relative bg-dark px-3 py-1.5 rounded-lg border border-primary/30">
                <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Latent.fun
                </span>
              </div>
            </div>
          </Link>

          <div className="flex items-center space-x-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  pathname === item.href
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center">
            <ConnectButton />
          </div>
        </div>
      </nav>
    </header>
  )
}

