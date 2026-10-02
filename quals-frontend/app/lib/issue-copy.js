/**
 * What the issuing page says to the person reading it (P0-42, P0-44).
 *
 * Plain JavaScript, like the academy's `doors.js` and for the same reason: the wording here is a
 * decision rather than decoration, and a decision worth making is worth checking. Keeping it out of
 * the component means a script can assert the states without a browser.
 *
 * There are three states a reader can land in, and they are not three variations of one sentence:
 *
 *   - something to add;
 *   - nothing to add, because it is all in the wallet already;
 *   - nothing waiting for this address at all.
 *
 * The first version said "your credentials are ready - choose the ones you would like" in all three,
 * which asks somebody to choose from nothing. That is the mistake this module exists to prevent: the
 * heading and the line under it have to be about the state the reader is actually in.
 */

/**
 * The heading and the line beneath it, for the state the reader is in.
 *
 * @param {number} itemCount      everything the institution holds for this address
 * @param {number} offerableCount how much of that is still to be collected
 * @returns {{ heading: string, lede: string }}
 */
export function chooserCopy(itemCount, offerableCount) {
  if (itemCount === 0) {
    return {
      heading: 'Nothing is waiting for this address',
      lede:
        'If you were expecting a credential, check that your institution used this address, or ask'
        + ' them to publish again.',
    };
  }

  if (offerableCount === 0) {
    return {
      heading:
        itemCount === 1
          ? 'Your credential is already in your wallet'
          : 'Your credentials are already in your wallet',
      lede: 'There is nothing to add. Ask your institution if you need another copy.',
    };
  }

  return {
    heading: itemCount === 1 ? 'Your credential is ready' : 'Your credentials are ready',
    lede:
      'Choose the ones you would like in your wallet. They stay there, signed by the institution'
      + ' that issued them, and adding one does not send it anywhere.',
  };
}
