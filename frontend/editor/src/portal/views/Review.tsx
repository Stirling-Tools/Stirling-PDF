import { useTranslation } from "react-i18next";
import { FileRunEventList } from "@portal/components/failures/FileRunEventList";
import "@portal/components/failures/failures.css";
import "@portal/views/Review.css";

/** What the processor needs a human to look at. Recorded failures today; held files
 * and approvals are meant to join them here. */
export function Review() {
  const { t } = useTranslation();

  return (
    <div className="portal-review">
      <div className="portal-review__head">
        <h1 className="portal-review__title">
          {t("portal.review.title", "Review")}
        </h1>
        <p className="portal-review__sub">
          {t(
            "portal.review.subtitle",
            "Anything from your policy runs and your team's editors that needs your attention.",
          )}
        </p>
      </div>

      <FileRunEventList />
    </div>
  );
}
