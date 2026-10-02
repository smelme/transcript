/**
 * Is this a phone? — for the screen that hands a credential over.
 *
 * The offer can be taken two ways, and which one to lead with depends on where the wallet is. A phone
 * with the wallet on it should be one tap; a laptop has nothing to tap, so it should be given
 * something to scan. That means the screen has to decide, and it decides from what the browser says
 * about itself.
 *
 * Three signals, in the order they can be trusted:
 *
 *   1. What the browser states outright. Chrome answers `userAgentData.mobile` as a boolean, and a
 *      browser that is willing to say so is worth more than anything parsed out of a string.
 *   2. The user agent, which is a mess but says `iPhone`, `Android` and so on plainly enough.
 *   3. A coarse primary pointer. This is what is left for an iPad, which reports itself as a desktop
 *      Macintosh: the touchscreen is the only honest thing about it.
 *
 * A touchscreen laptop lands on the phone side, which is the harmless way to be wrong here: it is
 * offered the button, and the QR code is one tap behind it.
 */
const PHONE_AGENT = /iPhone|iPod|iPad|Android|Windows Phone|IEMobile|BlackBerry|webOS|Opera Mini/i;

/**
 * @param {{ userAgent?: string, coarsePointer?: boolean, mobile?: boolean | null }} [signals] what the
 *   browser says about itself. `mobile` is the browser's own answer where it gives one; an absent or
 *   unknown answer is `null` rather than `false`, because "I do not know" and "no" are not the same.
 * @returns {boolean}
 */
export function looksLikePhone({ userAgent = '', coarsePointer = false, mobile = null } = {}) {
  if (typeof mobile === 'boolean') {return mobile;}
  if (PHONE_AGENT.test(String(userAgent || ''))) {return true;}
  return Boolean(coarsePointer);
}
