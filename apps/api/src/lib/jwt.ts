import { SignJWT, jwtVerify } from 'jose'

const encoder = new TextEncoder()

export async function signToken(
  secret: string,
  payload: Record<string, unknown>,
  expiresIn = '30d',
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encoder.encode(secret))
}

export async function verifyToken(secret: string, token: string): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(token, encoder.encode(secret))
  return payload as Record<string, unknown>
}
