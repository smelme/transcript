/**
 * The front door, for anyone who arrives without a share link.
 *
 * A shared document is opened from the link in its email, so this page has one job: say what Quals
 * is, and what to do about it, in the fewest words that are true. Nobody arrives here to browse -
 * they arrive holding a link, holding a message about a link, or holding nothing at all - so the
 * page answers those three cases and stops.
 */
export const metadata = {
  title: 'Quals',
  description: 'Quals opens the qualification or transcript somebody has shared with you.',
};

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          {/* The wallet's own mark, so the first thing on the page is the thing in the app. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hero-mark" src="/quals-mark.svg" alt="" width={52} height={52} />
          <span className="eyebrow">Quals · Digital credentials</span>
          <h1>Open the document somebody shared with you.</h1>
          <p className="lede">
            A qualification or a transcript, kept by the person who earned it and sent to one
            address. The link in that email opens it here.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="feature-grid">
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>You were sent a link</h3>
              <p>
                Open it. It shows the document to the address it was sent to and to nobody else.
                There is no account to make and nothing to install.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>The link has expired</h3>
              <p>
                Ask the person who sent it to share it again. Links are deliberately short-lived,
                and only they can send a new one.
              </p>
            </article>
            <article className="feature">
              <div className="feature-rule" aria-hidden="true" />
              <h3>You hold the credential</h3>
              <p>
                Sharing happens in your wallet, from the credential itself: you choose what to show
                and to whom, and the link you send is opened here.
              </p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
