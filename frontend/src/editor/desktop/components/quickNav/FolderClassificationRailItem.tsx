import { useNavigate } from "react-router-dom";
import { ClassificationProgressRing } from "@app/components/quickNav/ClassificationProgressRing";
import {
  dismissBackgroundClassification,
  useBackgroundClassification,
} from "@app/components/onboarding/classificationDemo/backgroundClassification";

/** Rail entry for a folder sweep still classifying after onboarding handed the canvas
 *  back. Renders nothing when no sweep is live. */
export function FolderClassificationRailItem() {
  const navigate = useNavigate();
  const activeSweep = useBackgroundClassification();
  if (!activeSweep) return null;
  return (
    <ClassificationProgressRing
      processed={activeSweep.processed}
      total={activeSweep.total}
      status={activeSweep.status === "done" ? "done" : "running"}
      folderName={activeSweep.folderName}
      onClick={() => navigate("/files")}
      onSettled={dismissBackgroundClassification}
    />
  );
}
