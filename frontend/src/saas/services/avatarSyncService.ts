/**
 * Avatar sync service for profile pictures.
 * Uses backend API instead of Supabase storage.
 */

import apiClient from '@app/services/apiClient'
import type { AuthUser } from '@app/auth/supabase'

const AVATAR_SIZE = 256
const MAX_AVATAR_SIZE = 500 * 1024

export interface ProfilePictureMetadata {
  user_id: string
  source: 'oauth' | 'upload'
  provider: 'google' | 'github' | 'apple' | 'azure' | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

/** Extract avatar URL from user metadata (if available from OAuth) */
export function getProviderAvatarUrl(user: AuthUser): string | null {
  // In Spring Security mode, OAuth avatar URLs are not directly available
  // The backend handles avatar syncing during OAuth login
  return null
}

/** Download and optimize an avatar image */
export async function downloadAndOptimizeAvatar(url: string): Promise<Blob> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!response.ok) {
    throw new Error(`Failed to download avatar: ${response.status}`)
  }

  const blob = await response.blob()
  const img = await createImageBitmap(blob)

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  const scale = Math.min(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height)
  const x = (AVATAR_SIZE - img.width * scale) / 2
  const y = (AVATAR_SIZE - img.height * scale) / 2
  ctx.drawImage(img, x, y, img.width * scale, img.height * scale)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (optimizedBlob) => {
        if (!optimizedBlob) {
          reject(new Error('Failed to create optimized blob'))
          return
        }
        if (optimizedBlob.size > MAX_AVATAR_SIZE) {
          canvas.toBlob(
            (lowerQualityBlob) => {
              if (lowerQualityBlob) resolve(lowerQualityBlob)
              else reject(new Error('Failed to create lower quality blob'))
            },
            'image/png',
            0.7
          )
        } else {
          resolve(optimizedBlob)
        }
      },
      'image/png',
      0.9
    )
  })
}

/** Upload avatar to backend storage */
export async function uploadAvatarToStorage(userId: string, blob: Blob): Promise<void> {
  const formData = new FormData()
  formData.append('file', blob, 'avatar.png')

  await apiClient.post('/api/v1/user/profile-picture', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** Fetch profile picture metadata from backend */
export async function getProfilePictureMetadata(
  _userId: string
): Promise<ProfilePictureMetadata | null> {
  try {
    const response = await apiClient.get<ProfilePictureMetadata>('/api/v1/user/profile-picture/metadata')
    return response.data
  } catch {
    return null
  }
}

/** Update profile picture metadata on backend */
export async function updateProfilePictureMetadata(
  _userId: string,
  data: Partial<Omit<ProfilePictureMetadata, 'user_id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  await apiClient.put('/api/v1/user/profile-picture/metadata', data)
}

/** Sync OAuth avatar — in Spring Security mode, this is handled server-side */
export async function syncOAuthAvatar(_user: AuthUser): Promise<boolean> {
  // OAuth avatar syncing is handled by the backend during the OAuth login flow
  return false
}
