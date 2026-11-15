import { PrismaClient } from '@prisma/client'
import { encrypt, decrypt } from '@/lib/encryption'

const SENSITIVE_KEYS = [
  'openaiKey', 'anthropicKey', 'googleKey', 'deepseekKey', 'minimaxKey',
  'groqKey', 'mistralKey', 'zhipuKey', 'lingyiKey', 'openrouterKey',
  'nvidiaKey', 'volcengineKey', 'searchKey',
]

const prismaClientSingleton = () => {
  const baseClient = new PrismaClient({
    datasources: {
      db: {
        url: 'file:D:/ClosedUI-database/dev.db'
      }
    }
  })

  return baseClient.$extends({
    query: {
      settings: {
        async $allOperations({ operation, args, query }) {
          const encryptFields = (data: any) => {
            if (!data) return
            for (const key of SENSITIVE_KEYS) {
              if (typeof data[key] === 'string' && data[key] && !data[key].startsWith('ENC:')) {
                data[key] = encrypt(data[key])
              }
            }
          }

          if (operation === 'create' || operation === 'update') {
            encryptFields((args as any).data)
          } else if (operation === 'upsert') {
            encryptFields((args as any).create)
            encryptFields((args as any).update)
          }

          const result = await query(args)

          const decryptFields = (data: any) => {
            if (!data) return
            for (const key of SENSITIVE_KEYS) {
              if (typeof data[key] === 'string' && data[key] && data[key].startsWith('ENC:')) {
                data[key] = decrypt(data[key])
              }
            }
          }

          if (result) {
            if (Array.isArray(result)) {
              result.forEach(decryptFields)
            } else {
              decryptFields(result)
            }
          }

          return result
        }
      }
    }
  }) as unknown as PrismaClient
}

declare global {
  var prismaGlobalNew: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobalNew ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobalNew = prisma
