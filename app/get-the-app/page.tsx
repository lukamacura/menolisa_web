import GetTheAppScreen from "@/components/GetTheAppScreen";

export const dynamic = "force-dynamic";

/**
 * The one stable URL that means "this happens in the app".
 *
 * Welcome and renewal emails and the daily log reminder all used to point at
 * /dashboard/symptoms (the tracker) or /chat/lisa. Both are gone — tracking,
 * chat and notifications are the Expo app's now — so those links need
 * somewhere that is honest on its own. Unlike the dashboard routes, this one
 * is reachable without a session, which is what an email opened on a new phone
 * actually needs.
 */
export default function GetTheAppPage() {
  return <GetTheAppScreen />;
}
