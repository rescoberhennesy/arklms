'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'

interface MessagesButtonProps {
  href: string
  unread?: number
}

export default function MessagesButton({ href, unread = 0 }: MessagesButtonProps) {
  const pathname = usePathname()
  const active = pathname.startsWith(href)
  const label = unread > 99 ? '99+' : String(unread)

  return (
    <Link
      href={href}
      aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}
      title="Messages"
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
        active
          ? 'bg-red-50 text-red-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <MessageCircle size={20} strokeWidth={2} />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 h-[18px] min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white ring-2 ring-white">
          {label}
        </span>
      )}
    </Link>
  )
}