/**
 * Application constants
 */

export const APP_STORE_URL =
  "https://apps.apple.com/de/app/menolisa/id6761130271?l=en-GB";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.menolisa.app&pcampaignid=web_share";

/**
 * Intrinsic size of the `/screenshots` masters, passed to next/image so the
 * reserved box matches the files' real aspect ratio.
 *
 * These used to sit in `components/PhoneShots.tsx` beside `<PhoneShot />` and
 * `<ShotStage />`, the phone-framed treatment shared by the diagnosis screen
 * and the paywall. The paywall dropped its copy of that card on 2026-09-11
 * ("a close is not a second pitch") and the diagnosis screen shows every shot
 * at hero size, so both components had no callers left and went with the file.
 * A shot from another master set must pass its own dimensions or it
 * letterboxes inside the reserved box.
 */
export const SHOT_W = 1320;
export const SHOT_H = 2868;
