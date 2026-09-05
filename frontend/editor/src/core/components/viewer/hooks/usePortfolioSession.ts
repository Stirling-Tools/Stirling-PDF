import { useCallback, useEffect, useState } from "react";
import type { PdfAttachmentObject } from "@embedpdf/models";

import { readPortfolioMembers } from "@app/utils/portfolioMembers";

// Keeps a portfolio pinned while its members are read, so the panel outlives
// opening one. Members match by name; their file ids are assigned after the click.

export interface PortfolioSession {
  file: File;
  members: PdfAttachmentObject[];
}

export function usePortfolioSession(activeFile: File | null) {
  const [session, setSession] = useState<PortfolioSession | null>(null);
  const [activeMemberName, setActiveMemberName] = useState<string | null>(null);

  const endSession = useCallback(() => {
    setSession(null);
    setActiveMemberName(null);
  }, []);

  useEffect(() => {
    if (!activeFile) {
      if (session) endSession();
      return;
    }

    if (session) {
      if (activeFile === session.file) {
        setActiveMemberName(null);
        return;
      }
      const member = session.members.find((m) => m.name === activeFile.name);
      if (member) {
        setActiveMemberName(member.name);
        return;
      }
    }

    let cancelled = false;
    void readPortfolioMembers(activeFile).then((members) => {
      if (cancelled) return;
      if (members) {
        setSession({ file: activeFile, members });
        setActiveMemberName(null);
      } else if (session) {
        endSession();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeFile, session, endSession]);

  return { session, activeMemberName, endSession };
}
