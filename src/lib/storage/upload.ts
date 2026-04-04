import { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // Documents
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
  'application/json', 'application/xml', 'text/xml',
  // Code/Data archives
  'application/zip', 'application/gzip', 'application/x-tar',
  'application/jsonlines', 'application/vnd.apache.parquet',
]

export const MAX_ATTACHMENTS_PER_PARENT = 5

export const IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]

export function validateFileMetadata(
  filename: string,
  mimeType: string,
  fileSize: number
): { valid: boolean; error?: string; code?: string } {
  if (!filename || filename.length === 0) {
    return { valid: false, error: 'Filename is required', code: 'VALIDATION_ERROR' }
  }
  if (filename.length > 500) {
    return { valid: false, error: 'Filename too long (max 500 chars)', code: 'VALIDATION_ERROR' }
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: 'File type not allowed', code: 'INVALID_FILE_TYPE' }
  }
  if (fileSize <= 0) {
    return { valid: false, error: 'File size must be positive', code: 'VALIDATION_ERROR' }
  }
  if (fileSize > MAX_FILE_SIZE) {
    return { valid: false, error: 'File exceeds 50MB limit', code: 'FILE_TOO_LARGE' }
  }
  return { valid: true }
}

export function sanitizeFilename(filename: string): string {
  // Remove path components (prevent traversal)
  const basename = filename.replace(/^.*[/\\]/, '')

  // Split into name and extension
  const lastDot = basename.lastIndexOf('.')
  const name = lastDot > 0 ? basename.slice(0, lastDot) : basename
  const ext = lastDot > 0 ? basename.slice(lastDot) : ''

  // Keep only alphanumeric, hyphens, underscores
  const safeName = name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100)

  const safeExt = ext
    .replace(/[^a-zA-Z0-9.]/g, '')
    .slice(0, 20)

  return (safeName || 'file') + safeExt
}

export function buildStoragePath(parentId: string, filename: string): string {
  const uuid = randomUUID()
  const safe = sanitizeFilename(filename)
  return `${parentId}/${uuid}-${safe}`
}

export async function createSignedUploadUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<{ signedUrl: string; token: string } | { error: string }> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path)

  if (error || !data) {
    return { error: error?.message ?? 'Failed to create upload URL' }
  }

  return { signedUrl: data.signedUrl, token: data.token }
}

export async function createSignedDownloadUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 300
): Promise<{ signedUrl: string } | { error: string }> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error || !data) {
    return { error: error?.message ?? 'Failed to create download URL' }
  }

  return { signedUrl: data.signedUrl }
}

export async function verifyStorageFile(
  supabase: SupabaseClient,
  bucket: string,
  storagePath: string
): Promise<{ exists: boolean; metadata?: { size: number; contentType: string } }> {
  // Extract directory and filename from path
  const lastSlash = storagePath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? storagePath.slice(0, lastSlash) : ''
  const filename = lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(dir, { search: filename })

  if (error || !data || data.length === 0) {
    return { exists: false }
  }

  const file = data.find(f => f.name === filename)
  if (!file) {
    return { exists: false }
  }

  return {
    exists: true,
    metadata: {
      size: file.metadata?.size ?? 0,
      contentType: file.metadata?.mimetype ?? 'application/octet-stream',
    },
  }
}

export async function deleteStorageFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<void> {
  await supabase.storage.from(bucket).remove([path])
}
