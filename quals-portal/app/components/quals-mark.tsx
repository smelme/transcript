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
      viewBox="0 0 120 120"
      role="img"
      aria-label="Quals"
    >
      {/* The artwork's own coordinates, shifted so its ink sits in the middle of this box: the
          supplied drawing is half a unit off centre, and centring the box alone would carry that onto
          the page, just as it did on the phone. */}
      <g transform="translate(0.5 -0.5)">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M51.5,4.5 C76,4.5 97,28 97,59 C97,90 78,113.5 51.5,113.5 C25,113.5 6,90 6,59 C6,28 27,4.5 51.5,4.5 Z M51.5,15 C63,16 76,36 76,60 C76,80 74,94 66,101 C60,105 49,105 42,99.5 C31,92 27,78 27,60 C27,38 40,16 51.5,15 Z"
        />
        <path d="M52,91.5 C56.5,93.5 60,95 63.5,97" fill="none" stroke="#c9a227" strokeWidth={9.5} strokeLinecap="round" />
        <path d="M60,95.5 C66,100 69,102 72,104" fill="none" stroke="#c9a227" strokeWidth={6.5} strokeLinecap="round" />
        <path d="M75,104 C79,107 84,110 88,112" fill="none" stroke="#c9a227" strokeWidth={12} strokeLinecap="round" />
        <ellipse cx="103" cy="98" rx={7} ry={8.5} fill="#c9a227" />
        <ellipse cx="101" cy="107" rx={6} ry={4} fill="#c9a227" />
        <path d="M98,93 L95.5,80.5 M101.5,93 L101,79 M106,93 L106.5,79 M110,93 L112.5,81" fill="none" stroke="#c9a227" strokeWidth={2.6} strokeLinecap="round" />
      </g>
    </svg>
  );
}
