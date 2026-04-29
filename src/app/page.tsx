import LandingNavbar from '@/components/landing/LandingNavbar'
import HeroSection from '@/components/landing/HeroSection'
import Footer from '@/components/landing/Footer'

export default function HomePage() {
  return (
    <div className="app-root">
      <LandingNavbar />
      <HeroSection />
      <Footer />
    </div>
  )
}