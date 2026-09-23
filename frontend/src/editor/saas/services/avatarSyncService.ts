/**
 * Avatar sync service for OAuth provider profile pictures
 * Downloads, optimizes, and syncs profile pictures from OAuth providers
 */

import { supabase } from "@app/auth/supabase";
import type { User } from "@supabase/supabase-js";

const PROFILE_BUCKET = "profile-pictures";
const AVATAR_SIZE = 256; // 256x256 pixels
const MAX_AVATAR_SIZE = 500 * 1024; // 500KB max file size after optimization
const SYNC_INTERVAL_DAYS = 7; // Resync every 7 days

// Client-side cache to prevent repeated sync attempts in same browser session
const sessionSyncCache = new Map<
  string,
  { timestamp: number; success: boolean }
>();

export interface ProfilePictureMetadata {
  user_id: string;
  source: "oauth" | "upload";
  provider: "google" | "github" | "apple" | "azure" | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Extract avatar URL from OAuth provider user metadata
 * @param user Supabase User object
 * @returns Avatar URL or null if not available
 */
export function getProviderAvatarUrl(user: User): string | null {
  const provider = user.app_metadata?.provider;
  const metadata = user.user_metadata;

  if (!provider || !metadata) {
    return null;
  }

  switch (provider) {
    case "google":
    case "azure":
      // Google and Azure use 'picture' field
      return metadata.picture || null;
    case "github":
      // GitHub uses 'avatar_url' field
      return metadata.avatar_url || null;
    case "apple":
      // Apple doesn't provide profile pictures via OAuth
      return null;
    default:
      return null;
  }
}

/**
 * Download and optimize an avatar image
 * Resizes to 256x256 and converts to PNG format
 * @param url Avatar URL from OAuth provider
 * @returns Optimized image blob
 */
export async function downloadAndOptimizeAvatar(url: string): Promise<Blob> {
  try {
    // 1. Fetch image from provider URL
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download avatar: ${response.status} ${response.statusText}`,
      );
    }

    const blob = await response.blob();

    // 2. Create image bitmap
    const img = await createImageBitmap(blob);

    // 3. Create canvas and draw scaled image
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    // Draw image scaled to fit (maintains aspect ratio, centered)
    const scale = Math.min(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height);
    const x = (AVATAR_SIZE - img.width * scale) / 2;
    const y = (AVATAR_SIZE - img.height * scale) / 2;
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

    // 4. Convert to PNG blob with quality optimization
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (optimizedBlob) => {
          if (!optimizedBlob) {
            reject(new Error("Failed to create optimized blob"));
            return;
          }

          // Check file size
          if (optimizedBlob.size > MAX_AVATAR_SIZE) {
            console.warn(
              "[Avatar Sync] Optimized avatar exceeds max size:",
              optimizedBlob.size,
            );
            // Try with lower quality
            canvas.toBlob(
              (lowerQualityBlob) => {
                if (lowerQualityBlob) {
                  resolve(lowerQualityBlob);
                } else {
                  reject(new Error("Failed to create lower quality blob"));
                }
              },
              "image/png",
              0.7,
            );
          } else {
            resolve(optimizedBlob);
          }
        },
        "image/png",
        0.9,
      );
    });
  } catch (error) {
    console.error(
      "[Avatar Sync] Failed to download and optimize avatar:",
      error,
    );
    throw error;
  }
}

/**
 * Upload avatar blob to Supabase Storage
 * @param userId User ID
 * @param blob Optimized avatar blob
 */
export async function uploadAvatarToStorage(
  userId: string,
  blob: Blob,
): Promise<void> {
  try {
    const profilePath = `${userId}/avatar`;

    console.debug("[Avatar Sync] Uploading avatar to storage:", profilePath);

    // Upload to Supabase Storage (overwrites existing file)
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(profilePath, blob, {
        upsert: true, // Overwrite existing file
        contentType: "image/png",
        cacheControl: "3600", // Cache for 1 hour
      });

    if (uploadError) {
      throw uploadError;
    }

    console.debug("[Avatar Sync] Avatar uploaded successfully");
  } catch (error) {
    console.error("[Avatar Sync] Failed to upload avatar to storage:", error);
    throw error;
  }
}

/**
 * Fetch profile picture metadata for a user
 * @param userId User ID
 * @returns Metadata or null if not found
 */
export async function getProfilePictureMetadata(
  userId: string,
): Promise<ProfilePictureMetadata | null> {
  try {
    const { data, error } = await supabase
      .from("profile_picture_metadata")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // If table doesn't exist, that's expected before migration runs
      if (
        error.code === "PGRST116" ||
        error.message?.includes("does not exist")
      ) {
        console.debug(
          "[Avatar Sync] Metadata table not found - migration may not be applied yet",
        );
        return null;
      }
      console.error(
        "[Avatar Sync] Failed to fetch profile picture metadata:",
        error,
      );
      return null;
    }

    return data;
  } catch (error) {
    console.error("[Avatar Sync] Unexpected error fetching metadata:", error);
    return null;
  }
}

/**
 * Update or insert profile picture metadata
 * @param userId User ID
 * @param data Partial metadata to update
 */
export async function updateProfilePictureMetadata(
  userId: string,
  data: Partial<
    Omit<ProfilePictureMetadata, "user_id" | "created_at" | "updated_at">
  >,
): Promise<void> {
  try {
    const { error } = await supabase.from("profile_picture_metadata").upsert(
      {
        user_id: userId,
        ...data,
      },
      {
        onConflict: "user_id",
      },
    );

    if (error) {
      // If table doesn't exist, log but don't crash
      if (
        error.code === "PGRST116" ||
        error.message?.includes("does not exist")
      ) {
        console.warn(
          "[Avatar Sync] Cannot update metadata - table does not exist. Run migration first.",
        );
        return; // Don't throw, allow feature to work without metadata tracking
      }
      throw error;
    }

    console.debug("[Avatar Sync] Metadata updated successfully");
  } catch (error) {
    console.error("[Avatar Sync] Failed to update metadata:", error);
    throw error;
  }
}

/**
 * Main function to sync OAuth avatar for a user
 * Downloads avatar from OAuth provider and uploads to Supabase Storage
 * Only syncs if:
 * - User is authenticated via OAuth provider that supports avatars
 * - User hasn't manually uploaded a picture (source !== 'upload')
 * - Last sync was more than SYNC_INTERVAL_DAYS ago (or never synced)
 *
 * @param user Supabase User object
 * @returns true if sync was performed, false if skipped
 */
export async function syncOAuthAvatar(user: User): Promise<boolean> {
  const cacheKey = user.id;

  try {
    // 0. Check client-side session cache first (prevent repeated attempts)
    const cached = sessionSyncCache.get(cacheKey);
    if (cached) {
      const minutesSinceLastAttempt =
        (Date.now() - cached.timestamp) / (1000 * 60);
      if (minutesSinceLastAttempt < 60) {
        console.debug(
          "[Avatar Sync] Skipping sync - already attempted in this session:",
          {
            minutesAgo: minutesSinceLastAttempt.toFixed(1),
            lastSuccess: cached.success,
          },
        );
        return cached.success;
      }
    }

    // 1. Check if user is OAuth authenticated
    const provider = user.app_metadata?.provider;
    console.debug("[Avatar Sync] Checking user for sync:", {
      provider,
      userId: user.id,
      email: user.email,
      hasUserMetadata: !!user.user_metadata,
      userMetadataKeys: user.user_metadata
        ? Object.keys(user.user_metadata)
        : [],
    });

    if (!provider || !["google", "github", "azure"].includes(provider)) {
      console.debug(
        "[Avatar Sync] Skipping sync - not an OAuth provider with avatar support",
      );
      sessionSyncCache.set(cacheKey, { timestamp: Date.now(), success: false });
      return false;
    }

    // 2. Get metadata to check if sync is needed
    const metadata = await getProfilePictureMetadata(user.id);

    // Skip if user has manually uploaded a picture
    if (metadata?.source === "upload") {
      console.debug("[Avatar Sync] Skipping sync - user has manual upload");
      sessionSyncCache.set(cacheKey, { timestamp: Date.now(), success: false });
      return false;
    }

    // Skip if synced recently (within SYNC_INTERVAL_DAYS)
    if (metadata?.last_synced_at) {
      const lastSync = new Date(metadata.last_synced_at);
      const daysSinceSync =
        (Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSync < SYNC_INTERVAL_DAYS) {
        console.debug("[Avatar Sync] Skipping sync - synced recently:", {
          daysSinceSync: daysSinceSync.toFixed(1),
          threshold: SYNC_INTERVAL_DAYS,
        });
        sessionSyncCache.set(cacheKey, {
          timestamp: Date.now(),
          success: true,
        });
        return false;
      }
    }

    // 3. Extract provider avatar URL
    const avatarUrl = getProviderAvatarUrl(user);
    console.debug("[Avatar Sync] Avatar URL extraction:", {
      provider,
      avatarUrl,
      hasAvatarUrl: !!avatarUrl,
    });

    if (!avatarUrl) {
      console.debug("[Avatar Sync] No avatar URL available from provider");
      sessionSyncCache.set(cacheKey, { timestamp: Date.now(), success: false });
      return false;
    }

    console.debug(
      "[Avatar Sync] Starting sync for provider:",
      provider,
      "with URL:",
      avatarUrl,
    );

    // 4. Download and optimize avatar
    const optimizedBlob = await downloadAndOptimizeAvatar(avatarUrl);

    // 5. Upload to Supabase Storage
    await uploadAvatarToStorage(user.id, optimizedBlob);

    // 6. Update metadata
    await updateProfilePictureMetadata(user.id, {
      source: "oauth",
      provider: provider as ProfilePictureMetadata["provider"],
      last_synced_at: new Date().toISOString(),
    });

    console.debug("[Avatar Sync] Sync completed successfully");
    sessionSyncCache.set(cacheKey, { timestamp: Date.now(), success: true });
    return true;
  } catch (error) {
    console.error("[Avatar Sync] Failed to sync OAuth avatar:", error);
    // Cache the failure to prevent repeated attempts
    sessionSyncCache.set(cacheKey, { timestamp: Date.now(), success: false });
    // Don't throw - gracefully degrade to existing picture or initials
    return false;
  }
}
