import GetTheAppScreen from "@/components/GetTheAppScreen";

export const dynamic = "force-dynamic";

/**
 * The one stable URL that means "this happens in the app".
 *
 * Welcome and renewal emails and the daily log reminder all used to point at
 * /dashboard/symptoms, which was the tracker while the web app served the
 * product and a store-badge wall afterwards. The tracker is gone, so those
 * links need somewhere that is honest on its own — and unlike the dashboard
 * routes, this one is reachable without a session, which is what an email
 * opened on a new phone actually needs.
 */
export default function GetTheAppPage() {
  return <GetTheAppScreen />;
}
