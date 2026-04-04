import { describe, it, expect } from 'vitest'
import {
  validateFileMetadata,
  sanitizeFilename,
  buildStoragePath,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS_PER_PARENT,
} from '@/lib/storage/upload'

describe('validateFileMetadata', () => {
  it('accepts valid file metadata', () => {
    const result = validateFileMetadata('report.pdf', 'application/pdf', 1024)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('accepts all whitelisted MIME types', () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      const result = validateFileMetadata('test.bin', mime, 100)
      expect(result.valid).toBe(true)
    }
  })

  it('rejects empty filename', () => {
    const result = validateFileMetadata('', 'application/pdf', 1024)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('rejects filename exceeding 500 chars', () => {
    const longName = 'a'.repeat(501) + '.pdf'
    const result = validateFileMetadata(longName, 'application/pdf', 1024)
    expect(result.valid).toBe(false)
  })

  it('rejects invalid MIME type', () => {
    const result = validateFileMetadata('script.exe', 'application/x-executable', 1024)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('INVALID_FILE_TYPE')
  })

  it('rejects application/octet-stream', () => {
    const result = validateFileMetadata('data.bin', 'application/octet-stream', 1024)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('INVALID_FILE_TYPE')
  })

  it('rejects zero file size', () => {
    const result = validateFileMetadata('file.pdf', 'application/pdf', 0)
    expect(result.valid).toBe(false)
  })

  it('rejects negative file size', () => {
    const result = validateFileMetadata('file.pdf', 'application/pdf', -1)
    expect(result.valid).toBe(false)
  })

  it('rejects file exceeding 50MB', () => {
    const result = validateFileMetadata('big.zip', 'application/zip', MAX_FILE_SIZE + 1)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('FILE_TOO_LARGE')
  })

  it('accepts file at exactly 50MB', () => {
    const result = validateFileMetadata('exact.zip', 'application/zip', MAX_FILE_SIZE)
    expect(result.valid).toBe(true)
  })
})

describe('sanitizeFilename', () => {
  it('preserves simple filenames', () => {
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf')
    expect(sanitizeFilename('my-file_2024.json')).toBe('my-file_2024.json')
  })

  it('removes path traversal attempts', () => {
    expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('system32')
  })

  it('removes path components', () => {
    expect(sanitizeFilename('/usr/local/bin/script.sh')).toBe('script.sh')
    expect(sanitizeFilename('C:\\Users\\file.txt')).toBe('file.txt')
  })

  it('replaces special characters with underscores', () => {
    const result = sanitizeFilename('my file (1) [final].pdf')
    expect(result).toBe('my_file_1_final_.pdf')
  })

  it('collapses multiple underscores', () => {
    const result = sanitizeFilename('a   b___c.txt')
    expect(result).toBe('a_b_c.txt')
  })

  it('handles files without extension', () => {
    expect(sanitizeFilename('Makefile')).toBe('Makefile')
  })

  it('handles dotfiles', () => {
    // Leading dot becomes underscore, no extension detected (lastDot is 0, not > 0)
    expect(sanitizeFilename('.gitignore')).toBe('_gitignore')
  })

  it('truncates long filenames to 100 chars + extension', () => {
    const longName = 'a'.repeat(200) + '.pdf'
    const result = sanitizeFilename(longName)
    expect(result.length).toBeLessThanOrEqual(124) // 100 name + 4 ext
    expect(result.endsWith('.pdf')).toBe(true)
  })

  it('removes special chars from extension', () => {
    const result = sanitizeFilename('file.p<h>p')
    expect(result).toBe('file.php')
  })

  it('returns underscore for names that sanitize to only underscores', () => {
    const result = sanitizeFilename('!!!.pdf')
    expect(result).toBe('_.pdf')
    expect(result.endsWith('.pdf')).toBe(true)
  })

  it('handles unicode characters', () => {
    const result = sanitizeFilename('reporte_año_2024.pdf')
    expect(result).not.toContain('ñ')
    expect(result.endsWith('.pdf')).toBe(true)
  })
})

describe('buildStoragePath', () => {
  it('generates path with parentId prefix', () => {
    const path = buildStoragePath('abc-123', 'report.pdf')
    expect(path.startsWith('abc-123/')).toBe(true)
  })

  it('includes UUID in the path', () => {
    const path = buildStoragePath('job-id', 'file.txt')
    // Format: {parentId}/{uuid}-{sanitized_filename}
    const parts = path.split('/')
    expect(parts).toHaveLength(2)
    // UUID is 36 chars, followed by dash and filename
    expect(parts[1].length).toBeGreaterThan(37)
  })

  it('generates unique paths for same input', () => {
    const path1 = buildStoragePath('id', 'file.txt')
    const path2 = buildStoragePath('id', 'file.txt')
    expect(path1).not.toBe(path2)
  })

  it('sanitizes the filename in the path', () => {
    const path = buildStoragePath('id', '../../../etc/passwd')
    expect(path).not.toContain('..')
    expect(path.startsWith('id/')).toBe(true)
  })
})

describe('constants', () => {
  it('MAX_FILE_SIZE is 50MB', () => {
    expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024)
  })

  it('MAX_ATTACHMENTS_PER_PARENT is 5', () => {
    expect(MAX_ATTACHMENTS_PER_PARENT).toBe(5)
  })

  it('ALLOWED_MIME_TYPES does not include application/octet-stream', () => {
    expect(ALLOWED_MIME_TYPES).not.toContain('application/octet-stream')
  })

  it('ALLOWED_MIME_TYPES does not include image/svg+xml (XSS vector)', () => {
    expect(ALLOWED_MIME_TYPES).not.toContain('image/svg+xml')
  })

  it('ALLOWED_MIME_TYPES includes common image types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg')
    expect(ALLOWED_MIME_TYPES).toContain('image/png')
    expect(ALLOWED_MIME_TYPES).toContain('image/gif')
  })

  it('ALLOWED_MIME_TYPES includes common document types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf')
    expect(ALLOWED_MIME_TYPES).toContain('application/json')
    expect(ALLOWED_MIME_TYPES).toContain('text/plain')
  })

  it('ALLOWED_MIME_TYPES includes archive types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/zip')
    expect(ALLOWED_MIME_TYPES).toContain('application/gzip')
  })
})
