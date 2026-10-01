import { useEffect, useState } from "react";
import { useIntersection } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@app/auth/UseSession";
import { fetchSigningThumbnail } from "@app/api/signing";
import { qk } from "@app/query/keys";
import { Icon } from "@app/ui/Icon";
import { PrivateContent } from "@app/components/shared/PrivateContent";

/** Loads only near visible rows; preview bytes are account-scoped and object URLs released on change. */
export function SigningSessionThumbnail({
  sessionId,
  finalized,
}: {
  sessionId: string;
  finalized: boolean;
}) {
  const { user } = useAuth();
  const { ref, entry } = useIntersection<HTMLSpanElement>({
    rootMargin: "120px",
  });
  const { data } = useQuery({
    queryKey: qk.signingThumbnail(user?.id ?? null, sessionId, finalized),
    queryFn: ({ signal }) => fetchSigningThumbnail(sessionId, signal),
    enabled: Boolean(user?.id && entry?.isIntersecting),
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(
    null,
  );
  useEffect(() => {
    if (!data) return;
    const url = URL.createObjectURL(data);
    setPreview({ blob: data, url });
    return () => URL.revokeObjectURL(url);
  }, [data]);
  return (
    <span ref={ref} className="signing-session-thumbnail" aria-hidden="true">
      {preview && preview.blob === data ? (
        <PrivateContent>
          <img src={preview.url} alt="" draggable={false} />
        </PrivateContent>
      ) : (
        <Icon name="file-text" size={24} />
      )}
    </span>
  );
}
