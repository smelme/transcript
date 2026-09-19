import Link from 'next/link';

export const metadata = {
  title: 'Digital credentials: Smart Academy',
};

export default function DigitalCredentialsPage() {
  return (
    <>
      <section className="section" style={{ paddingTop: 48 }}>
        <div className="container-narrow">
          <span className="eyebrow" style={{ color: 'var(--link)' }}>
            Digital credentials
          </span>
          <h1 style={{ fontSize: 36, letterSpacing: '-0.02em', margin: '14px 0 14px' }}>
            Your transcripts and qualifications, in your wallet
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--muted)', margin: 0 }}>
            Smart Academy issues its academic records as verifiable digital credentials. Instead of
            a PDF that anyone can alter, you hold a cryptographically signed record on your own
            device. And you choose how much of it to reveal.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container-narrow">
          <div className="section-head">
            <h2>What a digital credential contains</h2>
            <p>
              Your record is issued once and covers both your qualification and your academic
              transcript.
            </p>
          </div>
          <dl className="definition-list">
            <dt>Holder</dt>
            <dd>Your name and date of birth, as held by the academy</dd>
            <dt>Qualification</dt>
            <dd>Programme, degree level, field of study, graduation date and overall result</dd>
            <dt>Transcript</dt>
            <dd>Completed modules, credits awarded and the status of your award</dd>
            <dt>Issuer</dt>
            <dd>Smart Academy, with a digital signature that proves it is genuine</dd>
          </dl>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Saving it to your wallet</h2>
            <p>
              Your credentials live on your phone, protected by the device's secure hardware and
              unlocked with your biometrics.
            </p>
          </div>
          <div className="steps">
            <div className="step">
              <h3>Install the Quals wallet</h3>
              <p>Download the Quals app from your phone's app store.</p>
            </div>
            <div className="step">
              <h3>Request your credentials</h3>
              <p>
                Enter your email address here at Smart Academy and open the secure link we send you.
              </p>
            </div>
            <div className="step">
              <h3>Scan and store</h3>
              <p>
                Scan the code shown on screen. Your credential is written to your wallet and stays
                under your control.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Sharing your record</h2>
            <p>Different situations need different amounts of information. You decide each time.</p>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Choose the fields</h3>
              <p>
                Share just your name, your qualification, or your full transcript. Nothing is
                disclosed that you have not selected.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Send a secure link</h3>
              <p>
                For organisations that cannot connect directly, send a link. The recipient signs in
                with a one-time code and sees only the fields you chose.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Verify on the spot</h3>
              <p>
                Verifiers connected to the Quals network can check your credential directly, without
                contacting the academy.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Privacy and security</h2>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Signed by the academy</h3>
              <p>
                Every credential carries a digital signature. A verifier can confirm it came from
                Smart Academy and that it has not been altered.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Bound to your device</h3>
              <p>
                Your credential is tied to a key in your phone's secure hardware, so a copy taken
                from your device cannot be presented as yours.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>Revocable by the academy</h3>
              <p>
                If a record is withdrawn or corrected, the academy can revoke it, and verifiers are
                told it is no longer valid.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ maxWidth: 620 }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Get your credentials</h2>
              <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                You will need the email address Smart Academy holds for you.
              </p>
            </div>
            <Link href="/get-credentials" className="btn btn-dark">
              Start
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
