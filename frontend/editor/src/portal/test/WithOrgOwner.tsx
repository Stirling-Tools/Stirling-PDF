import type { Decorator } from "@storybook/react-vite";
import { AuthContext, useAuth } from "@app/auth/context";

/** Account-link stories default to the owner; orgOwner: false previews another administrator. */
export const WithOrgOwner: Decorator = (Story, context) => {
  const auth = useAuth();
  return (
    <AuthContext.Provider
      value={{
        ...auth,
        loading: false,
        isAdmin: true,
        user: {
          id: "1",
          email: "owner@example.com",
          username: "owner",
          role: "ROLE_ADMIN",
          orgOwner: context.parameters.orgOwner !== false,
        },
      }}
    >
      <Story />
    </AuthContext.Provider>
  );
};
