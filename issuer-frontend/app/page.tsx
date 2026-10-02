import Link from 'next/link';
import { CHECKED_PATH, COPY, REQUEST_PAGE_URL } from './lib/doors';

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="eyebrow">Smart Academy · Digital credentials</span>
          <h1>Your qualifications, verifiable anywhere.</h1>
          <p className="lede">
            Your degree and your academic transcript, issued as digital credentials that live in
            your own wallet. Show an employer in seconds, and share only what you choose.
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
              Your whole academic record, held by you. Every credential is signed by Smart Academy,
              so anybody you show it to can check it is genuine.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Qualification certificate</h3>
              <p>
                Your degree, your programme and the date you graduated — enough for an employer to
                check in seconds.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Academic transcript</h3>
              <p>
                Every module you completed, your credit totals and your overall result, in the same
                form as the certificate.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>You choose what to show</h3>
              <p>
                Your name on its own, your qualification, or the full transcript. You decide each
                time, and nothing else goes with it.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>How it works</h2>
            <p>Three steps, once. After that they are yours.</p>
          </div>
          <div className="steps">
            <div className="step">
              <h3>Request your credentials</h3>
              <p>Enter the email address Smart Academy holds for you. We send you a link.</p>
            </div>
            <div className="step">
              <h3>Sign in and choose</h3>
              <p>Open the link, confirm it is you with a code, and review what is ready.</p>
            </div>
            <div className="step">
              <h3>Add to your wallet</h3>
              <p>
                Scan the code with the Quals wallet app. They stay on your device, unlocked by your
                fingerprint or your face.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="panel">
            <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Get your credentials</h2>
            <p className="muted" style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.6 }}>
              {COPY.intro}
            </p>
            <Link
              href="/get-credentials"
              className="btn btn-dark"
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
            >
              Sign in with your email
            </Link>
            <p className="muted" style={{ margin: '14px 0 0' }}>
              {CHECKED_PATH.prompt} <a href={REQUEST_PAGE_URL}>{CHECKED_PATH.action}</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
