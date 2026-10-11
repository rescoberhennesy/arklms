'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, Briefcase } from 'lucide-react'

type Program = {
  id: string
  code: string
  name: string
  description: string
  subjects: string[]
  careers: string[]
}

const PROGRAMS: Program[] = [
  {
    id: 'abm',
    code: 'ABM',
    name: 'Accountancy, Business and Management',
    description: 'For students who want to work in business, finance, or entrepreneurship.',
    subjects: ['Fundamentals of Accountancy', 'Business Math', 'Applied Economics', 'Business Finance'],
    careers: ['Accountant', 'Entrepreneur', 'Banker', 'Marketing Specialist'],
  },
  {
    id: 'humss',
    code: 'HUMSS',
    name: 'Humanities and Social Sciences',
    description: 'For students interested in people, society, communication, and public service.',
    subjects: ['Creative Writing', 'Philippine Politics and Governance', 'Community Engagement', 'Introduction to World Religions'],
    careers: ['Teacher', 'Lawyer', 'Journalist', 'Social Worker'],
  },
  {
    id: 'he',
    code: 'H.E',
    name: 'Home Economics',
    description: 'A TVL strand built on hands-on skills in hospitality, food, and services.',
    subjects: ['Cookery', 'Bread and Pastry Production', 'Food and Beverage Services', 'Housekeeping'],
    careers: ['Chef', 'Hotel Staff', 'Baker', 'Caterer'],
  },
  {
    id: 'ict',
    code: 'I.C.T',
    name: 'Information and Communications Technology',
    description: 'A TVL strand focused on computers, programming, and digital tools.',
    subjects: ['Computer Systems Servicing', 'Programming', 'Animation', 'Technical Drafting'],
    careers: ['Programmer', 'IT Support', 'Web Developer', 'Multimedia Artist'],
  },
]

export default function ProgramCards() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Close on Esc or a click outside the cards
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setActiveId(null)
    const onClick = (e: MouseEvent) => {
      if (!gridRef.current?.contains(e.target as Node)) setActiveId(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [])

  // Small delay so sweeping the mouse across the section doesn't flash popovers
  const schedule = (id: string | null) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setActiveId(id), 150)
  }

  return (
    <div className="strand-grid" ref={gridRef}>
      {PROGRAMS.map((p) => {
        const open = activeId === p.id
        const toggle = () => setActiveId(open ? null : p.id)

        return (
          <div
            key={p.id}
            className="strand-item"
            onMouseEnter={() => schedule(p.id)}
            onMouseLeave={() => schedule(null)}
          >
            <div
              className={`strand-card${open ? ' is-active' : ''}`}
              role="button"
              tabIndex={0}
              aria-expanded={open}
              aria-controls={`strand-${p.id}`}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle()
                }
              }}
            >
              <h3>{p.code}</h3>
              <p>{p.name}</p>
            </div>

            {open && (
              <div id={`strand-${p.id}`} className="strand-popover" role="dialog" aria-label={p.name}>
                <p className="strand-popover-desc">{p.description}</p>

                <p className="strand-popover-label">
                  <BookOpen size={14} /> Sample subjects
                </p>
                <ul className="strand-popover-list">
                  {p.subjects.map((s) => <li key={s}>{s}</li>)}
                </ul>

                <p className="strand-popover-label">
                  <Briefcase size={14} /> Possible careers
                </p>
                <div className="strand-popover-tags">
                  {p.careers.map((c) => <span key={c}>{c}</span>)}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}