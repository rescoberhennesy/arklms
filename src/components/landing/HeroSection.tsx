'use client'

import { useState } from 'react'

interface Slide {
  image: string
  title: string
  text: string
}

export default function HeroSection() {
  const slides: Slide[] = [
    {
      image: '/1.png',
      title: 'WELCOME TO A-LMS',
      text: 'This is your central hub for everything related to class announcements, course materials, and assignments. Please check this page regularly to stay informed about deadlines and new resources.',
    },
    {
      image: '/2.png',
      title: 'Admission for SY 2026–2027 is now open!!',
      text: 'Apply now and secure your future with ARK Technological Institute. Limited slots available.',
    },
  ]

  const [active, setActive] = useState(0)

  const nextSlide = () => {
    setActive((n) => (n + 1) % slides.length)
  }

  const prevSlide = () => {
    setActive((n) => (n - 1 + slides.length) % slides.length)
  }

  const goToSlide = (index: number) => {
    setActive(index)
  }

  return (
    <section className="hero-slider">
      <div
        className="hero-slide"
        style={{ backgroundImage: `url(${slides[active].image})` }}
      >
        <div className="hero-dark">
          <div className="hero-inner">
            <div className="hero-content">
              <h1>{slides[active].title}</h1>
              <p>{slides[active].text}</p>
            </div>
          </div>
        </div>
        <button className="hero-arrow left" onClick={prevSlide} aria-label="Previous slide">
          ‹
        </button>
        <button className="hero-arrow right" onClick={nextSlide} aria-label="Next slide">
          ›
        </button>
        <div className="hero-dots">
          {slides.map((_, index) => (
            <span
              key={index}
              className={`hero-dot ${active === index ? 'active' : ''}`}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}