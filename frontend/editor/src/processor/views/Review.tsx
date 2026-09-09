import { useTranslation } from "react-i18next";
import { FileRunEventList } from "@processor/components/failures/FileRunEventList";
import "@processor/components/failures/failures.css";
import "@processor/views/Review.css";

/** What the processor needs a human to look at. Recorded failures today; held files
 * and approvals are meant to join them here. */
export function Review() {
  const { t } = useTranslation();

  return (
    <div className="processor-review">
      <div className="processor-review__head">
        <h1 className="processor-review__title">
          {t("processor.review.title", "Review")}
        </h1>
        <p className="processor-review__sub">
          {t(
            "processor.review.subtitle",
            "Anything from your policy runs and your team's editors that needs your attention.",
          )}
        </p>
      </div>

      <FileRunEventList />
    </div>
  );
}
