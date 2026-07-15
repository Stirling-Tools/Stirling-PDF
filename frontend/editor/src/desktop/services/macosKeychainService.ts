import { invoke } from "@tauri-apps/api/core";
import {
  ChooseMacosSigningIdentityResult,
  MacosSigningIdentity,
} from "@app/services/macosKeychainService";

export function isMacosKeychainAvailable(): boolean {
  return true;
}

export async function chooseMacosSigningIdentity(): Promise<ChooseMacosSigningIdentityResult> {
  return invoke<ChooseMacosSigningIdentityResult>("choose_macos_signing_identity");
}

export type { ChooseMacosSigningIdentityResult, MacosSigningIdentity };
