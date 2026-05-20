import LandingNavbar from '@/components/landing/LandingNavbar'
import Footer from '@/components/landing/Footer'
import { GraduationCap, Sparkles, Users, BookOpen } from 'lucide-react'

export default function AboutPage() {
  return (
    <>
      <LandingNavbar />

      <main className="about-page">
        {/* Header band */}
        <section className="about-hero">
          <div className="about-hero-inner">
            <h1>About</h1>
            <p>Learn about ARK Technological Institute and the A-LMS platform.</p>
          </div>
        </section>

        {/* The school */}
        <section className="about-section">
          <div className="about-section-inner">
            <div className="about-eyebrow">
              <GraduationCap size={18} />
              <span>The Institution</span>
            </div>
            <h2>ARK Technological Institute Education System Inc.</h2>
            <p>
              ARK Technological Institute is an educational institution based in
              Lucena, Philippines, offering Senior High School and TESDA
              technical-vocational programs. The school provides Senior High
              School strands in Accountancy, Business and Management (ABM),
              Humanities and Social Sciences (HUMSS), Home Economics (H.E), and
              Information and Communications Technology (I.C.T), preparing
              students for both higher education and the workforce.
            </p>
            <p>
              Since 2015, ARK has been committed to making quality education
              accessible to its community, combining academic instruction with
              practical, skills-based training.
            </p>
          </div>
        </section>

        {/* The platform */}
        <section className="about-section about-section-alt">
          <div className="about-section-inner">
            <div className="about-eyebrow">
              <Sparkles size={18} />
              <span>The Platform</span>
            </div>
            <h2>A-LMS — Smart Learning Management System</h2>
            <p>
              A-LMS is a Teacher-Centered Learning Management System with AI
              Instructional Support, built specifically for ARK Technological
              Institute. The platform brings classes, modules, activities,
              quizzes, and grading into one place, while keeping teachers in
              control of how their lessons are designed and delivered.
            </p>
            <p>
              Our goal is to make day-to-day teaching faster and more focused,
              and to give students a clear, organized space to learn — without
              replacing the human judgment that makes good teaching work.
            </p>

            <div className="about-features">
              <div className="about-feature">
                <BookOpen size={20} />
                <h3>Classes &amp; Modules</h3>
                <p>
                  Organize lessons by term, attach materials, and keep
                  everything students need in one place.
                </p>
              </div>
              <div className="about-feature">
                <Sparkles size={20} />
                <h3>AI Instructional Support</h3>
                <p>
                  Generate quizzes and flashcards from lesson material, get
                  draft announcements, and analyze student progress — with the
                  teacher reviewing every output.
                </p>
              </div>
              <div className="about-feature">
                <Users size={20} />
                <h3>Teacher-Centered Design</h3>
                <p>
                  Built around how teachers actually work. AI assists, but
                  teachers decide what gets published, graded, and shared.
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