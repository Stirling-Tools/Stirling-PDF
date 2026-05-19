import UserbackWidget from "@app/components/feedback/UserbackWidget";

export function HomePageExtensions() {
  const userbackToken = import.meta.env.VITE_USERBACK_TOKEN;
  return userbackToken ? <UserbackWidget token={userbackToken} /> : null;
}
