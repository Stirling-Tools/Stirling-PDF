import { Avatar } from "@mantine/core";
import { useAuth } from "@editor/auth/UseSession";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

export function useConfigButtonIcon(): React.ReactNode {
  const { profilePictureUrl, user } = useAuth();
  if (profilePictureUrl) {
    return (
      <Avatar
        src={profilePictureUrl}
        radius="xl"
        size={24}
        className={privateContentClassName}
      />
    );
  }
  // Mirror the settings page fallback (initials avatar) so both spots show
  // the same identity badge while the picture URL is unavailable.
  const initial = user?.email?.trim()?.charAt(0)?.toUpperCase();
  return initial ? (
    <Avatar
      radius="xl"
      size={24}
      color="blue"
      className={privateContentClassName}
    >
      {initial}
    </Avatar>
  ) : null;
}
