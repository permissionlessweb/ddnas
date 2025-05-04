import { createCors } from 'itty-cors'
import { Router } from 'itty-router'

import { fetchAllDaoKeys } from './routes/fetchDaoKeys'
import { fetchProfile } from './routes/fetchProfile'
import { handleNonce } from './routes/nonce'
import { registerDnasKeys } from './routes/registerDnas'
import { registerPublicKeys } from './routes/registerPublicKeys'
import { resolveProfile } from './routes/resolveProfile'
import { searchProfiles } from './routes/searchProfiles'
import { stats } from './routes/stats'
import { unregisterDnasKeys } from './routes/unregisterDnasKeys'
import { unregisterPublicKeys } from './routes/unregisterPublicKeys'
import { updateDnasKeys } from './routes/updateDnasKeys'
import { updateProfile } from './routes/updateProfile'
import { useDnasKeys } from './routes/useDnasKeys'
import { Env } from './types'
import { KnownError } from './utils'
import { authMiddleware } from './utils/auth'

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

// Unregister existing public keys.
router.post('/unregister', authMiddleware, unregisterPublicKeys)

// Register more public keys.
router.post('/register', authMiddleware, registerPublicKeys)

//   ~~~~  DNAS ENTRY POINTS  ~~~~
// Register dnas ap keys.
router.post('/register-dnas', authMiddleware, registerDnasKeys)

// Update dnas.
router.post('/update-dnas', authMiddleware, updateDnasKeys)

// Register dnas ap keys.
router.post('/unregister-dnas', authMiddleware, unregisterDnasKeys)

// Request to use a dnas key as a DAO member
router.post('/use-dnas', useDnasKeys)

// fetch all keys available for a given DAO
router.get('/daoKeys/address/:bech32Address', fetchAllDaoKeys)
router.get('/daoKeys/bech32/:addressHex', fetchAllDaoKeys)

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
