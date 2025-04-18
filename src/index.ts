import { createCors } from 'itty-cors'
import { Router } from 'itty-router'

import { fetchProfile } from './routes/fetchProfile'
import { handleNonce } from './routes/nonce'
import { registerPublicKeys } from './routes/registerPublicKeys'
import { resolveProfile } from './routes/resolveProfile'
import { searchProfiles } from './routes/searchProfiles'
import { stats } from './routes/stats'
import { unregisterPublicKeys } from './routes/unregisterPublicKeys'
import { updateProfile } from './routes/updateProfile'
import { Env } from './types'
import { KnownError } from './utils'
import { authMiddleware, formDataAuthMiddleware } from './utils/auth'
import { useDnasKeys } from './routes/useDnasKeys'
import { registerDnasKeys } from './routes/registerDnas'
import { unregisterDnasKeys } from './routes/unregisterDnasKeys'

// Create CORS handlers.
const { preflight, corsify } = createCors({
  methods: ['GET', 'POST'],
  origins: ['*'],
  maxAge: 3600,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  },
})

const router = Router()

// Handle CORS preflight.
router.all('*', preflight)

// Get stats.
router.get('/stats', stats)

// Get nonce for publicKey.
router.get('/nonce/:publicKey', handleNonce)

// Search profiles.
router.get('/search/:chainId/:namePrefix', searchProfiles)

// Resolve profile.
router.get('/resolve/:chainId/:name', resolveProfile)

// Fetch profile.
router.get('/:publicKey', fetchProfile)

// Fetch profile with bech32 address.
router.get('/address/:bech32Address', fetchProfile)

// Fetch profile with address hex.
router.get('/hex/:addressHex', fetchProfile)
// Backwards compatible.
router.get('/bech32/:addressHex', fetchProfile)

// Update profile.
router.post('/', authMiddleware, updateProfile)

// Register more public keys.
router.post('/register', authMiddleware, registerPublicKeys)

// Register dnas ap keys.
router.post('/register-dnas', authMiddleware, registerDnasKeys)

// Unregister existing public keys.
router.post('/unregister', authMiddleware, unregisterPublicKeys)

// Register dnas ap keys.
router.post('/unregister-dnas', authMiddleware, unregisterDnasKeys)

// Request to use a dnas key as a DAO member
router.post('/use-dnas', formDataAuthMiddleware, useDnasKeys)

// 404
router.all('*', () => new Response('404', { status: 404 }))

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router
      .handle(request, env)
      .catch((err) => {
        if (err instanceof KnownError) {
          return new Response(JSON.stringify(err.responseJson), {
            status: err.statusCode,
          })
        }

        console.error('Unknown error', err)
        return new Response(
          JSON.stringify({
            error:
              'Unknown error occurred: ' +
              (err instanceof Error ? err.message : `${err}`),
          }),
          {
            status: 500,
          }
        )
      })
      .then(corsify)
  },
}
