import { useTranslation } from "react-i18next";

/**
 * Time-of-day greeting + today's date, shown above the paid-tier home hero.
 * Free tier opens with the welcome banner instead, so this is paid-only.
 */
export function HomeGreeting() {
  const { t } = useTranslation();
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12
      ? t("portal.home.greeting.morning")
      : hour < 18
        ? t("portal.home.greeting.afternoon")
        : t("portal.home.greeting.evening");
  const date = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header className="portal-home__greeting">
      <h1 className="portal-home__greeting-title">{greeting}</h1>
      <p className="portal-home__greeting-date">{date}</p>
    </header>
  );
}
