/**
 * The Quals mark: a white Q whose tail is a hand, in gold.
 *
 * Inline SVG rather than a file in `public/`, for two measured reasons rather than taste. This
 * deployment does not serve static files at all - every unknown path comes back as the app itself,
 * which turned the file reference into a broken image - and the paths that do have a file behind them
 * are served with a year-long shared cache under a fixed name, so a redrawn mark would sit unseen
 * behind the old one. Six lines of SVG cost less than either problem.
 *
 * The Q takes its colour from its surroundings so it reads on the black sidebar the way the app draws
 * it, and the tail and the hand are the gold of the logo, always.
 */
export default function QualsMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Quals"
    >
      {/* The artwork centred in its own box: the Q sits up and to the left of the 64 grid while the
          hand reaches down and to the right, so centring the box alone does not centre the mark. */}
      <g transform="translate(-3.51 -0.61) scale(0.9642)">
        <ellipse cx="30" cy="26" rx="13.5" ry="18" fill="none" stroke="currentColor" strokeWidth={8.5} />
        <path
          d="M23.5 37 C31 43 37 37.5 44 43 C48 46.5 50 49 51.5 51.5"
          fill="none"
          stroke="#c9a227"
          strokeWidth={5.4}
          strokeLinecap="round"
        />
        <circle cx="51.5" cy="51.5" r={2.9} fill="#c9a227" />
        <path
          d="M51.5 51.5 L44.5 60.5 M51.5 51.5 L50.5 62.5 M51.5 51.5 L56 61.5 M51.5 51.5 L60 57"
          fill="none"
          stroke="#c9a227"
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
