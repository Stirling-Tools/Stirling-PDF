import { invoke } from "@tauri-apps/api/core";
import type {
  ChooseMacosSigningIdentityResult,
  MacosSigningIdentity,
} from "@core/services/macosKeychainService";
export { isSha256IdentityHash } from "@core/services/macosKeychainService";

export function isMacosKeychainAvailable(): boolean {
  return true;
}

export async function chooseMacosSigningIdentity(): Promise<ChooseMacosSigningIdentityResult> {
  return invoke<ChooseMacosSigningIdentityResult>(
    "choose_macos_signing_identity",
  );
}

export type { ChooseMacosSigningIdentityResult, MacosSigningIdentity };
