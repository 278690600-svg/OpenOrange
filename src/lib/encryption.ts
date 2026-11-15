import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const ALGORITHM = 'aes-256-cbc'

let cachedEncryptionKey: Buffer | null = null

export function getEncryptionKey(): Buffer {
  if (cachedEncryptionKey) return cachedEncryptionKey

  let keyStr = process.env.ENCRYPTION_KEY
  
  if (!keyStr) {
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      const match = content.match(/^ENCRYPTION_KEY=["']?([a-f0-9]{64})["']?/m)
      if (match) {
        keyStr = match[1]
      }
    }
  }

  if (!keyStr) {
    const generated = crypto.randomBytes(32).toString('hex')
    const envPath = path.join(process.cwd(), '.env')
    const line = `\nENCRYPTION_KEY="${generated}"\n`
    fs.appendFileSync(envPath, line)
    process.env.ENCRYPTION_KEY = generated
    keyStr = generated
  }

  cachedEncryptionKey = Buffer.from(keyStr, 'hex')
  return cachedEncryptionKey
}

export function encrypt(text: string): string {
  if (!text) return text
  try {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return `ENC:${iv.toString('hex')}:${encrypted}`
  } catch (e) {
    console.error('Encryption failed:', e)
    return text
  }
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return encryptedText
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 3 || parts[0] !== 'ENC') {
      return encryptedText
    }
    const iv = Buffer.from(parts[1], 'hex')
    const encrypted = parts[2]
    const key = getEncryptionKey()
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e) {
    console.error('Decryption failed:', e)
    return encryptedText
  }
}
