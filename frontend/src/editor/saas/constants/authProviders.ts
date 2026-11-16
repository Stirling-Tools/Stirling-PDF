export type OAuthProviderId = "google" | "apple" | "github" | "azure";

export type OAuthProviderMeta = {
  id: OAuthProviderId;
  label: string;
  file: string;
  isDisabled: boolean;
};

export const oauthProviders: readonly OAuthProviderMeta[] = [
  { id: "google", label: "Google", file: "google.svg", isDisabled: false },
  { id: "github", label: "GitHub", file: "github.svg", isDisabled: false },
] as const;
