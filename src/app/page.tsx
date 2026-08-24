import LandingNavbar from '@/components/landing/LandingNavbar'
import HeroSection from '@/components/landing/HeroSection'
import Footer from '@/components/landing/Footer'
import { GraduationCap, Sparkles } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="app-root">
      <LandingNavbar />
      <HeroSection />

      {/* 
      <section className="home-stats">
        <div className="home-stats-inner">
          <div className="home-stat">
            <h3>2015</h3>
            <p>Established</p>
          </div>
          <div className="home-stat">
            <h3>4</h3>
            <p>Senior High Strands</p>
          </div>
          <div className="home-stat">
            <h3>3</h3>
            <p>User Roles Supported</p>
          </div>
          <div className="home-stat">
            <h3>AI</h3>
            <p>Instructional Support</p>
          </div>
        </div>
      </section> */}

      {/* Strands showcase */}
      <section className="home-strands">
        <div className="home-strands-inner">
          <div className="about-eyebrow">
            <GraduationCap size={18} />
            <span>Senior High Strands</span>
          </div>
          <h2>Programs Offered</h2>

          <div className="strand-grid">
            <div className="strand-card">
              <h3>ABM</h3>
              <p>Accountancy, Business and Management</p>
            </div>
            <div className="strand-card">
              <h3>HUMSS</h3>
              <p>Humanities and Social Sciences</p>
            </div>
            <div className="strand-card">
              <h3>H.E</h3>
              <p>Home Economics</p>
            </div>
            <div className="strand-card">
              <h3>I.C.T</h3>
              <p>Information and Communications Technology</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="home-steps">
        <div className="home-steps-inner">
          <div className="about-eyebrow">
            <h1>Ready to get Started?</h1>
          </div>
          <h2>How A-LMS Works</h2>

          <div className="step-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Log In</h3>
              <p>Sign in with your ARK account to access your dashboard.</p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>View Your Classes</h3>
              <p>See modules, lessons, and activities organized by your enrolled classes.</p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Track Your Progress</h3>
              <p>Submit activities, check grades, and stay on top of deadlines.</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}