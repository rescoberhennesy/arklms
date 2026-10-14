'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, Briefcase } from 'lucide-react'

type Program = {
  id: string
  track: 'Academic' | 'TechPro'
  code: string
  name: string
  description: string
  focus: string[]
  careers: string[]
}

// Strengthened SHS Curriculum (DepEd): two tracks — Academic and
// Technical-Professional (TechPro) — each with elective clusters.
// Focus areas are descriptive, not official subject titles; confirm the
// exact electives with the school's registrar.
const PROGRAMS: Program[] = [
  {
    id: 'assh',
    track: 'Academic',
    code: 'ASSH',
    name: 'Arts, Social Science, and Humanities',
    description:
      'For students interested in people, society, culture, and communication — a path toward college programs in the social sciences, education, and the humanities.',
    focus: ['Social sciences', 'Humanities and the arts', 'Communication and media', 'Community and public service'],
    careers: ['Teacher', 'Lawyer', 'Journalist', 'Psychologist', 'Social Worker'],
  },
  {
    id: 'be',
    track: 'Academic',
    code: 'BE',
    name: 'Business and Entrepreneurship',
    description:
      'For students who want to start, manage, or grow a business — a path toward college programs in business, accountancy, and management.',
    focus: ['Business fundamentals', 'Entrepreneurship', 'Accounting basics', 'Marketing and management'],
    careers: ['Entrepreneur', 'Accountant', 'Marketing Specialist', 'Business Manager', 'Banker'],
  },
  {
    id: 'ht',
    track: 'TechPro',
    code: 'H&T',
    name: 'Hospitality and Tourism',
    description:
      'A hands-on track for students who want to work in hotels, restaurants, travel, and events, with skills they can use right after graduation.',
    focus: ['Food and beverage services', 'Front office and housekeeping', 'Tourism and travel services', 'Events management'],
    careers: ['Chef', 'Hotel Staff', 'Tour Guide', 'Flight Attendant', 'Events Coordinator'],
  },
  {
    id: 'ict',
    track: 'TechPro',
    code: 'ICT',
    name: 'ICT Support and Computer Programming',
    description:
      'A hands-on track for students who like computers and technology — from setting up and fixing systems to writing their own programs.',
    focus: ['Computer systems servicing', 'Networking basics', 'Computer programming', 'Technical support'],
    careers: ['Programmer', 'IT Support Specialist', 'Web Developer', 'Network Technician'],
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
                              <span className="strand-track">{p.track === 'TechPro' ? 'Tech-Pro Track' : 'Academic Track'}</span>
                <p className="strand-popover-desc">{p.description}</p>

                <p className="strand-popover-label">
                  <BookOpen size={14} /> Focus areas
                </p>
                <ul className="strand-popover-list">
                  {p.focus.map((s) => <li key={s}>{s}</li>)}
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