import type { SignaturePreview } from "@app/components/viewer/viewerTypes";
import { getFileColor } from "@app/components/pageEditor/fileColors";
import type { SigningParticipantPreview } from "@app/types/signingSession";

/** Only submitted marks overlay the original PDF; finalized PDFs already contain those marks. */
export function getSubmittedSignaturePreviews(session: {
  finalized?: boolean;
  participants?: SigningParticipantPreview[];
}): SignaturePreview[] {
  if (session.finalized) return [];
  return (session.participants ?? []).flatMap(
    (participant, participantIndex) =>
      participant.status !== "SIGNED"
        ? []
        : (participant.wetSignatures ?? []).map((mark, index) => ({
            id: `participant-${participant.id}-sig-${index}`,
            pageIndex: mark.page,
            x: mark.x,
            y: mark.y,
            width: mark.width,
            height: mark.height,
            signatureData: mark.data,
            signatureType: "image" as const,
            color: getFileColor(participantIndex),
            participantName: participant.name,
          })),
  );
}
