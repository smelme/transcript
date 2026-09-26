import Link from 'next/link';
import { DOORS, REQUEST_PAGE_URL } from './lib/doors';

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="eyebrow">Smart Academy · Digital credentials</span>
          <h1>Your qualifications, verifiable anywhere.</h1>
          <p className="lede">
            Smart Academy issues your degree and academic transcript as a digital credential that
            lives in your own wallet. Prove your qualifications to employers and institutions
            without waiting for paper documents, and share only what you choose.
          </p>
          <div className="hero-actions">
            <Link href="/get-credentials" className="btn btn-primary">
              Get your digital credentials
            </Link>
            <Link href="/credentials" className="btn btn-ghost">
              How it works
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>What you receive</h2>
            <p>
              One wallet, your whole academic record. Each credential is cryptographically signed by
              Smart Academy and can be verified by anyone you share it with.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Qualification certificate</h3>
              <p>
                Your degree, programme and graduation date, issued as a tamper-evident credential
                that employers can verify instantly.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Academic transcript</h3>
              <p>
                Your completed modules, credit totals and overall result, presented in the same
                verifiable format as the certificate.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Selective sharing</h3>
              <p>
                Share your name only, your qualification, or the full transcript. You decide exactly
                which fields are disclosed each time.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>How it works</h2>
            <p>Three steps, once. After that your credentials stay with you.</p>
          </div>
          <div className="steps">
            <div className="step">
              <h3>Request your credentials</h3>
              <p>
                Enter the email address Smart Academy holds for you. We will send you a secure link.
              </p>
            </div>
            <div className="step">
              <h3>Sign in and choose</h3>
              <p>
                Open the link, confirm it is you with a one-time code, and review the credentials
                that are ready.
              </p>
            </div>
            <div className="step">
              <h3>Add to your wallet</h3>
              <p>
                Scan the code with the Quals wallet app. Your credentials are stored on your device,
                protected by your biometrics.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="panel">
            <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Two ways to get your credentials</h2>
            <p className="muted" style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.6 }}>
              Which one applies to you depends on when you finished. Tell us your address and we
              will say, or take either one directly.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 16,
              }}
            >
              {Object.values(DOORS).map((door) => (
                <div key={door.key}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{door.name}</p>
                  <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.55 }}>
                    Costs {door.cost.toLowerCase()} · takes {door.wait.toLowerCase()} · you need{' '}
                    {door.needs.toLowerCase()}
                  </p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
              <Link
                href="/get-credentials"
                className="btn btn-dark"
                style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
              >
                Check what we hold
              </Link>
              <a
                className="btn"
                href={REQUEST_PAGE_URL}
                style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
              >
                {DOORS.checked.action}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
