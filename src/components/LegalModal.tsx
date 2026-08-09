type LegalModalType = 'terms' | 'privacy'

export default function LegalModal({ type, onClose }: { type: LegalModalType; onClose: () => void }) {
  const title = type === 'terms' ? 'Terms of Service' : 'Privacy Policy'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-8 py-6 border-b border-border">
          <h3 className="font-display text-2xl font-bold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-muted hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="px-8 py-6 overflow-y-auto space-y-5 text-sm text-muted-foreground leading-relaxed">
          {type === 'terms' ? (
            <>
              <p>
                These Terms of Service govern your access to and use of TMAS (Tracking, Monitoring, and Assessing
                Students), the learning management platform provided to UENR and its affiliated students, lecturers,
                and administrators. By creating an account or using TMAS, you agree to these terms.
              </p>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">1. Accounts</h4>
                <p>
                  You are responsible for maintaining the confidentiality of your login credentials and for all
                  activity under your account. Lecturer accounts require administrator approval before access is
                  granted. Notify an administrator immediately if you suspect unauthorized use of your account.
                </p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">2. Acceptable Use</h4>
                <p>
                  TMAS may be used only for legitimate teaching, learning, and assessment purposes. You agree not to
                  misrepresent your identity, attempt to bypass quiz timers or scheduling controls, share quiz
                  content with unauthorized parties, or interfere with the platform's normal operation.
                </p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">3. Academic Content</h4>
                <p>
                  Course materials, quizzes, and generated question banks remain the intellectual property of the
                  uploading lecturer and their institution. Students may use materials solely for personal study
                  within their enrolled courses.
                </p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">4. Availability</h4>
                <p>
                  We aim to keep TMAS available at all times but do not guarantee uninterrupted access. Scheduled
                  quiz windows, deadlines, and results are recorded server-side and are authoritative in the event of
                  a client-side or connectivity issue.
                </p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">5. Changes</h4>
                <p>
                  These terms may be updated from time to time to reflect changes to the platform or applicable
                  policy. Continued use of TMAS after an update constitutes acceptance of the revised terms.
                </p>
              </div>
            </>
          ) : (
            <>
              <p>
                This Privacy Policy explains what information TMAS collects and how it is used to operate the
                platform for UENR students, lecturers, and administrators.
              </p>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">1. Information We Collect</h4>
                <p>
                  Account details you provide at registration (name, email, role, index number, level, and program
                  for students; department for lecturers), authentication data (a securely hashed password — never
                  stored in plain text), and platform activity such as materials read, quiz attempts, scores, and
                  reading-progress telemetry (scroll depth and time spent) used to power progress dashboards.
                </p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">2. How We Use It</h4>
                <p>
                  Your information is used to authenticate your account, enforce role-based access, display accurate
                  progress and performance data to you and to lecturers/administrators overseeing your course or
                  institution, and to send in-platform notifications relevant to your account (approvals, quiz
                  releases, results).
                </p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">3. Data Storage</h4>
                <p>
                  Data is stored in a managed Supabase/Postgres database. Session tokens are signed and expire
                  automatically; passwords are hashed using bcrypt before storage.
                </p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">4. Sharing</h4>
                <p>
                  We do not sell your personal information. Academic performance data is visible only to you, your
                  course lecturer(s), and institutional administrators, as required for academic oversight.
                </p>
              </div>
              <div>
                <h4 className="text-foreground font-semibold mb-1.5">5. Your Choices</h4>
                <p>
                  You may request account correction or deletion by contacting your institution's administrator
                  through the "Send us a message" form. Some records may be retained where required for academic
                  record-keeping.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-8 py-5 border-t border-border">
          <button
            onClick={onClose}
            className="w-full bg-primary hover:bg-blue-950 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
