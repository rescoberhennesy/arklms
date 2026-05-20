import { Mail, Phone, MapPin, Info, MessageSquare } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="footer-area">
      <div className="footer-inner">
        <div className="footer-col brand">
          <h3>ARK Technological Institute Education System Inc.</h3>
          <p>
            Empowering students and teachers through innovative
            technology-driven education using A-LMS, a Smart Teacher-Centered
            Learning Management System with AI Instructional Support.
          </p>
        </div>

        <div className="footer-col">
          <h4>QUICK LINKS</h4>
          <a href="/about">
            <Info size={16} /> About
          </a>
          <a href="/contact">
            <MessageSquare size={16} /> Contact
          </a>
        </div>

        <div className="footer-col">
          <h4>CONTACT US</h4>
          <p>
            <MapPin size={25} /> J-Seven Building, Magallanes Cor Granja St.
            Brgy 7, Lucena, Philippines, 4301
          </p>
          <p>
            <Phone size={16} /> 0907-082-9390
          </p>
          <p>
            <Mail size={16} /> ark.lucena@gmail.com
          </p>
        </div>
      </div>
      <div className="footer-bottom">
        © 2015 ARK Technological Institute Education System Inc. All rights
        reserved.
      </div>
    </footer>
  )
}