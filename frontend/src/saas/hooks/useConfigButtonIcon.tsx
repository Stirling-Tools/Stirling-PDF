import { Avatar } from "@mantine/core";
import { useAuth } from "@app/auth/UseSession";

export function useConfigButtonIcon(): React.ReactNode {
  const { profilePictureUrl } = useAuth();
  return profilePictureUrl ? (
    <Avatar src={profilePictureUrl} radius="xl" size={24} />
  ) : null;
}
