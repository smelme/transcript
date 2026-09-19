/**
 * The front door, for anyone who arrives without a share link. A shared document is opened from
 * the link in the email, so this page says what Quals is and what to do if the link has gone
 * missing. It is deliberately short: nobody comes here to browse.
 */
export const metadata = {
  title: 'Quals',
  description: 'Quals shows a document that someone has shared with you.',
};

export default function HomePage() {
  return (
    <div className="card" style={{ maxWidth: 640, margin: '48px auto' }}>
      <h1>Quals</h1>
      <p>
        Quals is where a shared document is opened. Someone who holds a digital credential can send
        it to an address they choose, and the person who receives it opens that link here.
      </p>
      <p className="muted" style={{ marginTop: 16 }}>
        If you have been sent a document, open the link in that email. It shows the document only to
        the address it was sent to. If the link has expired, ask the sender to share it again.
      </p>
    </div>
  );
}
