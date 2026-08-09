import { useState } from 'react'
import type { AppView } from '../App'
import { API_BASE } from '../config'
import LegalModal from '../components/LegalModal'

const features = [
  { iconClass: 'fa-solid fa-robot text-primary', title: 'AI-Powered Quiz Generation', desc: 'Upload PDFs, slides, or documents and our AI extracts topics, identifies learning objectives, and generates a comprehensive question bank — ready for lecturer review.' },
  { iconClass: 'fa-solid fa-chart-column text-accent', title: 'Real-Time Progress Tracking', desc: 'Live dashboards show every student\'s completion rate, quiz performance, and learning trajectory across all enrolled courses.' },
  { iconClass: 'fa-solid fa-building-columns text-purple-600', title: 'Smart Academic Structure', desc: 'Configure a flexible institutional hierarchy — levels, courses, and assignments — that scales from small colleges to large universities.' },
  { iconClass: 'fa-solid fa-user-shield text-blue-600', title: 'Role-Based Access Control', desc: 'Administrators, lecturers, and students each access only what they need. Permissions are enforced at every layer of the platform.' },
  { iconClass: 'fa-solid fa-circle-check text-emerald-600', title: 'Automated Assessment', desc: 'Objective questions are graded instantly. Results, scores, and analytics are updated in real time as students complete assessments.' },
  { iconClass: 'fa-solid fa-bell text-amber-500', title: 'Unified Notification System', desc: 'Real-time in-app, email, and push notifications keep every stakeholder informed of approvals, deadlines, quiz releases, and results.' },
]

const steps = [
  { num: '01', title: 'Set Up Your Institution', desc: 'Administrators create academic levels, add courses, and build the full institutional hierarchy in minutes.' },
  { num: '02', title: 'Upload Learning Materials', desc: 'Lecturers upload PDFs, slides, or Word documents to their assigned courses. The system indexes all content automatically.' },
  { num: '03', title: 'AI Generates Question Banks', desc: 'Our AI extracts topics and learning objectives from uploaded materials then generates diverse, course-relevant questions.' },
  { num: '04', title: 'Students Learn and Get Assessed', desc: 'Students access materials, complete AI-generated quizzes, and track their progress — all in one seamless experience.' },
]

const faqs = [
  { q: 'How does the AI quiz generation work?', a: 'After a lecturer uploads a document, our AI extracts and preprocesses the text, identifies key topics and learning objectives, then generates Multiple Choice, True/False, Fill-in-the-Blank, and scenario-based questions — all grounded exclusively in the uploaded material. The lecturer reviews, edits, and approves before publishing.' },
  { q: 'Can I customize the academic structure for my institution?', a: 'Yes. Administrators can create any number of academic levels (Year 1, Semester 2, Term A, etc.), assign courses to those levels, and configure prerequisites. TMAS is flexible for universities, colleges, polytechnics, and professional training institutions.' },
  { q: 'What file formats are supported for learning materials?', a: 'TMAS supports PDF, DOC/DOCX, PPT/PPTX, TXT, and Markdown files. Each format is processed to extract clean, structured content for AI quiz generation.' },
  { q: 'How is student enrollment managed?', a: 'Students register and are assigned to an academic level by administrators. Once enrolled in a level, they gain access to all active courses within that level. Administrators can also enroll or transfer students individually or in bulk.' },
  { q: 'Is TMAS mobile-friendly?', a: 'Yes. The interface is fully responsive and optimized for desktop, tablet, and mobile. Progressive Web App (PWA) support for mobile push notifications is included in our upcoming release.' },
]

const roleCards = [
  {
    role: 'Administrator',
    iconClass: 'fa-solid fa-sliders text-purple-600',
    badge: 'bg-purple-100 text-purple-800',
    features: ['Full institutional control', 'Create and manage academic levels', 'Course creation and assignment', 'Lecturer approval workflow', 'Student enrollment management', 'Institution-wide analytics'],
    cta: 'Admin Login',
    navView: 'login' as const,
  },
  {
    role: 'Lecturer',
    iconClass: 'fa-solid fa-chalkboard-user text-blue-600',
    badge: 'bg-blue-100 text-blue-800',
    features: ['Manage assigned courses', 'Upload learning materials', 'AI-powered quiz generation', 'Review and edit questions', 'Publish quizzes to students', 'Monitor student performance'],
    cta: 'Register as Lecturer',
    navView: 'register' as const,
  },
  {
    role: 'Student',
    iconClass: 'fa-solid fa-graduation-cap text-emerald-600',
    badge: 'bg-green-100 text-green-800',
    features: ['Access enrolled courses', 'Download learning materials', 'Complete AI-generated quizzes', 'View scores and feedback', 'Track learning progress', 'Receive deadline reminders'],
    cta: 'Register as Student',
    navView: 'register' as const,
  },
]

export default function Landing({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [contactBusy, setContactBusy] = useState(false)
  const [contactStatus, setContactStatus] = useState('')
  const [contactError, setContactError] = useState('')
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null)

  async function handleContactSubmit() {
    setContactError('')
    setContactStatus('')
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setContactError('Please fill in your name, email, and message.')
      return
    }
    setContactBusy(true)
    try {
      const response = await fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), message: form.message.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not send message')
      setContactStatus(data.message || 'Thanks for reaching out — we will get back to you shortly.')
      setForm({ name: '', email: '', message: '' })
    } catch (error) {
      setContactError(error instanceof Error ? error.message : 'Could not send message')
    } finally {
      setContactBusy(false)
    }
  }

  return (
    <div className="font-sans bg-background text-foreground">

      {/* ── Navbar ── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-sidebar/96 backdrop-blur border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold font-mono">T</span>
            </div>
            <span className="text-sidebar-foreground font-semibold text-lg tracking-tight">TMAS</span>
          </div>

          <nav className="hidden md:flex items-center gap-7">
            {['Home', 'Features', 'About', 'FAQ', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} className="text-sidebar-foreground/65 hover:text-sidebar-foreground text-sm font-medium transition-colors">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onNavigate('login')}
              className="bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-semibold px-3.5 sm:px-4 py-2 rounded-xl transition-all border border-white/15"
            >
              Login
            </button>
            <button
              onClick={() => onNavigate('register')}
              className="bg-accent hover:bg-amber-600 text-white text-xs sm:text-sm font-semibold px-4 sm:px-5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <i className="fa-solid fa-user-plus text-xs" />
              <span>Register</span>
            </button>
            <button className="md:hidden text-sidebar-foreground p-2 rounded-lg hover:bg-white/5 ml-1" onClick={() => setMobileOpen(!mobileOpen)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden bg-sidebar border-t border-white/5 px-6 py-5 flex flex-col gap-4">
            {['Home', 'Features', 'About', 'FAQ', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} className="text-sidebar-foreground/70 text-sm font-medium" onClick={() => setMobileOpen(false)}>{item}</a>
            ))}
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section id="home" className="bg-sidebar min-h-screen flex items-center pt-16">
        <div className="max-w-7xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-16 items-center w-full">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
              <span className="text-sidebar-foreground/70 text-xs font-medium tracking-wider uppercase">AI-Powered Learning Management System</span>
            </div>

            <h1 className="font-display text-6xl lg:text-7xl text-sidebar-foreground leading-none mb-6">
              Track.<br />
              Monitor.<br />
              <span className="text-accent">Assess.</span>
            </h1>

            <p className="text-sidebar-foreground/60 text-lg leading-relaxed mb-10 max-w-lg">
              TMAS is an enterprise learning management platform built for modern universities. Create academic structures, upload course materials, and let AI generate, grade, and track 3-tier student assessments.
            </p>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => onNavigate('register')}
                className="bg-accent hover:bg-amber-600 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base shadow-lg shadow-amber-500/20 flex items-center gap-2"
              >
                <span>Get Started Now</span>
                <i className="fa-solid fa-arrow-right text-xs" />
              </button>
              <a
                href="#features"
                className="bg-white/10 hover:bg-white/15 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base border border-white/15"
              >
                Explore Features
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'AI Quiz Generation', desc: 'Automatic 3-tier assessments', iconClass: 'fa-solid fa-robot text-accent' },
              { label: 'Academic Structure', desc: 'Custom levels & course assignment', iconClass: 'fa-solid fa-building-columns text-primary' },
              { label: 'Real-Time Analytics', desc: 'Live student performance tracking', iconClass: 'fa-solid fa-chart-line text-emerald-400' },
              { label: 'Push Notifications', desc: 'Instant browser & OS alerts', iconClass: 'fa-solid fa-bell text-amber-400' },
            ].map((card, i) => (
              <div key={i} className="bg-white/5 border border-white/8 rounded-2xl p-6 hover:bg-white/8 transition-all">
                <i className={`${card.iconClass} text-2xl mb-3 block`} />
                <h3 className="text-sidebar-foreground font-semibold text-base mb-1">{card.label}</h3>
                <p className="text-sidebar-foreground/50 text-xs leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <section className="bg-primary py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          {[
            { val: '2,847+', label: 'Active Students' },
            { val: '180+', label: 'Courses Available' },
            { val: '98%', label: 'Quiz Accuracy Rate' },
            { val: '12', label: 'Institutions Served' },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-3xl font-bold font-mono text-accent">{s.val}</p>
              <p className="text-white/65 text-sm mt-1.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-3">Platform Features</p>
            <h2 className="font-display text-4xl lg:text-5xl text-foreground mb-5 leading-tight">
              Everything you need to run<br />a modern learning institution
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              From AI-powered quiz generation to real-time analytics — TMAS provides the complete infrastructure for higher education management.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-7 hover:shadow-lg hover:-translate-y-0.5 transition-all group cursor-default">
                <div className="mb-4">
                  <i className={`${f.iconClass} text-3xl`} />
                </div>
                <h3 className="font-semibold text-foreground text-lg mb-2.5 group-hover:text-primary transition-colors">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 bg-muted">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-3">Workflow</p>
            <h2 className="font-display text-4xl lg:text-5xl text-foreground mb-5">How TMAS Works</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
              A seamless flow from institutional setup to student assessment — automated, intelligent, and effortless.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10">
            {steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground font-display text-xl font-bold mb-5 shadow-lg">
                  {s.num}
                </div>
                <h3 className="font-semibold text-foreground mb-2.5">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Role Cards ── */}
      <section id="about" className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-3">Platform Roles</p>
            <h2 className="font-display text-4xl lg:text-5xl text-foreground mb-5">Built for every stakeholder</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
              TMAS provides a tailored experience for administrators, lecturers, and students — each with the exact tools they need.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {roleCards.map((r, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-8 flex flex-col">
                <div className="flex items-start gap-4 mb-6">
                  <div className="text-3xl">
                    <i className={r.iconClass} />
                  </div>
                  <div>
                    <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full mb-2 ${r.badge}`}>{r.role}</span>
                    <h3 className="font-display text-2xl text-foreground">{r.role} Portal</h3>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {r.features.map((feat, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <i className="fa-solid fa-check text-success text-xs shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <button onClick={() => onNavigate(r.navView)} className="w-full bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground font-semibold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
                  <span>{r.cta}</span>
                  <i className="fa-solid fa-arrow-right text-xs" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 bg-muted">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="font-display text-4xl lg:text-5xl text-foreground">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium text-foreground text-sm">{faq.q}</span>
                    <svg className={`w-4 h-4 text-muted-foreground shrink-0 ml-4 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 border-t border-border/60">
                    <p className="text-muted-foreground text-sm leading-relaxed pt-4">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-3">Contact Us</p>
            <h2 className="font-display text-4xl text-foreground mb-5 leading-tight">Get in touch with the TMAS team</h2>
            <p className="text-muted-foreground leading-relaxed mb-10">
              Ready to deploy TMAS at your institution? Have questions about pricing or customization? We are here to help.
            </p>
            <div className="space-y-5">
              {[
                { icon: '📧', label: 'Email', val: 'contact@tmas.edu' },
                { icon: '📞', label: 'Phone', val: '+1 (555) 234-5678' },
                { icon: '📍', label: 'Address', val: '123 Academic Avenue, Innovation Hub, Tech City' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="text-xl mt-0.5">{item.icon}</div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{item.label}</p>
                    <p className="text-foreground font-medium text-sm">{item.val}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8">
            <h3 className="font-semibold text-foreground text-lg mb-6">Send us a message</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Dr. Jane Smith" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@university.edu" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Message</label>
                <textarea rows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Tell us about your institution and requirements..." className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none" />
              </div>
              {contactStatus && <p className="text-sm text-emerald-600 font-medium">{contactStatus}</p>}
              {contactError && <p className="text-sm text-danger font-medium">{contactError}</p>}
              <button
                onClick={handleContactSubmit}
                disabled={contactBusy}
                className="w-full bg-primary hover:bg-blue-950 text-primary-foreground font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60"
              >
                {contactBusy ? <><i className="fa-solid fa-spinner fa-spin mr-2" />Sending...</> : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-sidebar border-t border-white/5 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                  <span className="text-white text-sm font-bold font-mono">T</span>
                </div>
                <span className="text-sidebar-foreground font-semibold text-lg">TMAS</span>
              </div>
              <p className="text-sidebar-foreground/50 text-sm leading-relaxed max-w-xs">
                Tracking, Monitoring, and Assessing Students — the next-generation LMS built for higher education institutions.
              </p>
            </div>
            <div>
              <h4 className="text-sidebar-foreground font-semibold text-sm mb-5">Platform</h4>
              <ul className="space-y-3">
                {['Features', 'How It Works', 'For Administrators', 'For Lecturers', 'For Students'].map(item => (
                  <li key={item}><a href="#features" className="text-sidebar-foreground/45 hover:text-sidebar-foreground text-sm transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sidebar-foreground font-semibold text-sm mb-5">Support</h4>
              <ul className="space-y-3">
                {[
                  { label: 'FAQ', href: '#faq' },
                  { label: 'Contact Us', href: '#contact' },
                  { label: 'Privacy Policy', onClick: () => setLegalModal('privacy') },
                  { label: 'Terms of Service', onClick: () => setLegalModal('terms') },
                  { label: 'System Status', href: '#' },
                ].map(item => (
                  <li key={item.label}>
                    {item.onClick ? (
                      <button onClick={item.onClick} className="text-sidebar-foreground/45 hover:text-sidebar-foreground text-sm transition-colors">{item.label}</button>
                    ) : (
                      <a href={item.href} className="text-sidebar-foreground/45 hover:text-sidebar-foreground text-sm transition-colors">{item.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <hr className="border-white/8 mb-8" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sidebar-foreground/35 text-sm">© 2025 TMAS. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <button onClick={() => setLegalModal('privacy')} className="text-sidebar-foreground/35 hover:text-sidebar-foreground text-sm transition-colors">Privacy Policy</button>
              <button onClick={() => setLegalModal('terms')} className="text-sidebar-foreground/35 hover:text-sidebar-foreground text-sm transition-colors">Terms of Service</button>
            </div>
          </div>
        </div>
      </footer>

      {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}

    </div>
  )
}
