import LandingNavbar from '@/components/landing/LandingNavbar'
import Footer from '@/components/landing/Footer'
import { Phone, Mail, MapPin, UserCog, ExternalLink } from 'lucide-react'

export default function ContactPage() {
  return (
    <>
      <LandingNavbar />

      <main className="contact-page">
        {/* Header band */}
        <section className="contact-hero">
          <div className="contact-hero-inner">
            <h1>Contact</h1>
            <p>
              Get in touch with ARK Technological Institute. We're most
              responsive on Facebook.
            </p>
          </div>
        </section>

        {/* Cards */}
        <section className="contact-section">
          <div className="contact-section-inner">
            <div className="contact-grid">
              {/* Facebook — Main */}
              <a
                href="https://web.facebook.com/ARKLucena"
                target="_blank"
                rel="noopener noreferrer"
                className="contact-card contact-card-primary"
              >
                <div className="contact-card-icon">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/>
  </svg>
</div>
                <h3>Main Facebook Page</h3>
                <p>
                  Follow ARK Technological Institute for announcements, events,
                  and enrollment updates.
                </p>
                <span className="contact-card-link">
                  facebook.com/ARKLucena →
                </span>
              </a>

              {/* Facebook — Registrar */}
              <a
                href="https://web.facebook.com/profile.php?id=61557314823960"
                target="_blank"
                rel="noopener noreferrer"
                className="contact-card"
              >
                <div className="contact-card-icon">
                  <UserCog size={26} />
                </div>
                <h3>Registrar's Office</h3>
                <p>
                  For records, enrollment, transcripts, and other registrar
                  concerns.
                </p>
                <span className="contact-card-link">
                  Visit Registrar's page →
                </span>
              </a>

              {/* Phone */}
              <a href="tel:+639070829390" className="contact-card">
                <div className="contact-card-icon">
                  <Phone size={26} />
                </div>
                <h3>Phone</h3>
                <p>Call us for direct inquiries during office hours.</p>
                <span className="contact-card-link">0907-082-9390</span>
              </a>

              {/* Email */}
              <a href="mailto:ark.lucena@gmail.com" className="contact-card">
                <div className="contact-card-icon">
                  <Mail size={26} />
                </div>
                <h3>Email</h3>
                <p>Send us a message and we'll get back to you.</p>
                <span className="contact-card-link">
                  ark.lucena@gmail.com
                </span>
              </a>
            </div>

            {/* Address */}
            <div className="contact-address">
              <MapPin size={20} />
              <div>
                <h4>Visit Us</h4>
                <p>
                  J-Seven Building, Magallanes Cor Granja St., Brgy 7, Lucena,
                  Philippines, 4301
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}