import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'
import { makePublicKey } from '../publicKeys'
import {
  AuthorizedRequest,

  DbRowProfile,
  Env,
  ProfileDnasKeyWithValue,
  PublicKey,
  RegisterDnasKeyRequest,
  RegisterDnasKeyResponse,
} from '../types'
import {
  INITIAL_NONCE,
  KnownError,
  addDnsProfileApiKey,
  getProfileFromPublicKeyHex,
  incrementProfileNonce,
  saveProfile,
  verifyDNASWidgetEnabledAndDaoMember,
} from '../utils'
import { MiddlewareAuthData, MiddlewareAuthObjectTransient } from '../utils/secret'
import { toBase64, Wallet } from 'secretjs'


// TODO: asssert storage offlien signDOc & sigantures are done for secret network
export const registerDnasKeys = async (
  {
    parsedBody: {
      data,
      signature,
    },
    publicKey,
  }: AuthorizedRequest<RegisterDnasKeyRequest>,
  env: Env
) => {
  const respond = (status: number, response: RegisterDnasKeyResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })
  try {
    if (!data.keys || !Array.isArray(data.keys)) {
      throw new Error('Keys must be provided as an array')
    }

    await Promise.all(
      data.keys.filter((key) => {
        return verifyDNASWidgetEnabledAndDaoMember(key.dao, data.auth)
      })
    )
  } catch (err) {
    if (err instanceof KnownError) {
      return respond(err.statusCode, err.responseJson)
    }

    return respond(400, {
      error:
        'Failed to validate ddnas register: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  const signer = publicKey.getBech32Address(data.auth.chainBech32Prefix)
  const mwOpWallet = new Wallet(process.env.MIDDLEWARE_MNEMONIC);

  const daoMemberSignedMsg = makeSignDoc(
    [
      {
        type: data.auth.type,
        value: {
          signer,
          data: JSON.stringify(data, undefined, 2),
        },
      },
    ],
    {
      gas: '0',
      amount: [
        {
          denom: data.auth.chainFeeDenom,
          amount: '0',
        },
      ],
    },
    data.auth.chainId,
    '',
    0,
    0
  )

  // Find or create profile.
  let profile: DbRowProfile
  try {
    let _profile: DbRowProfile | null = await getProfileFromPublicKeyHex(
      env,
      publicKey.value
    )
    // If no profile exists, create one.
    if (!_profile) {
      // console.log('NO PROFILE FOUND, SAVING NEW ONE:', publicKey.addressHex)
      _profile = await saveProfile(
        env,
        publicKey,
        {
          nonce: INITIAL_NONCE,
          name: null,
          nft: null,
        },
        // Create with the current chain preference.
        [data.auth.chainId]
      )
      // will save api keys to profile after validate & increment nonce
    }
    // Log after successful DB operation
    // console.log('FETCHING PROFILE VIA publicKey.hex:', publicKey.hex)
    // console.log('Profile saved successfully:', _profile)
    profile = _profile
  } catch (err) {
    console.error('Error saving profile:', err)
    return respond(500, {
      error:
        'Failed to retrieve existing profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // Validate all nonces to prevent replay attacks.
  if (data.auth.nonce !== profile.nonce) {
    return respond(401, {
      error: `Invalid nonce. Expected: ${profile.nonce}`,
    })
  }

  // Increment nonce to prevent replay attacks.
  try {
    await incrementProfileNonce(env, profile.id)
  } catch (err) {
    console.error('Profile nonce increment', err)

    return respond(500, {
      error:
        'Failed to increment profile nonce: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  const dnasKeysToAdd = Object.entries(
    data.keys.reduce(
      (acc, { dnas, dao, }) => {
        // form composite key
        const pubKeyKey = `${data.auth.publicKeyType}:${data.auth.publicKeyHex}`

        // Initialize the entry if it doesn't exist
        if (!acc[pubKeyKey]) {
          acc[pubKeyKey] = {
            apiKeyValue: { profileId: profile.id, ...dnas },
            daos: new Set<string>(),
            mwauthobj: new Set<MiddlewareAuthObjectTransient>(),
          }
        }

        let mwAuthObj: MiddlewareAuthData = {
          dm_bech32_addr: publicKey.getBech32Address(data.auth.chainBech32Prefix),
          nonce: profile.nonce,
        }

        const middlewareSignDoc = makeSignDoc(
          [
            {
              type: data.auth.type,
              value: {
                signer,
                data: JSON.stringify({
                  data: Buffer.from(JSON.stringify(mwAuthObj), 'utf8')
                }, undefined, 2),
              },
            },
          ],
          {
            gas: '0',
            amount: [
              {
                denom: data.auth.chainFeeDenom,
                amount: '0',
              },
            ],
          },
          data.auth.chainId,
          '',
          0,
          0
        )


        let returnMw: MiddlewareAuthObjectTransient = {
          ...mwAuthObj,
          signMsgDocs: middlewareSignDoc,
          compositeKey: pubKeyKey,
          dmAuth: {
            msg: Buffer.from(JSON.stringify(daoMemberSignedMsg), 'utf8').toString('base64'),
            sig: signature,
            pubkey: publicKey
          }
        }

        // Add the dao value to the Set
        // Format should be "chainId:daoAddr"
        const daoKey = `${data.auth.chainId}:${dao}`
        acc[pubKeyKey].daos.add(daoKey)
        acc[pubKeyKey].mwauthobj.add(returnMw)

        return acc
      },
      {} as Record<
        string,
        { apiKeyValue: ProfileDnasKeyWithValue; daos: Set<string>, mwauthobj: Set<MiddlewareAuthObjectTransient>, }
      >
    )
  )

  try {
    await Promise.all(
      dnasKeysToAdd.map(([pk, entry]) => {
        const [pkType, pkHex] = pk.split(':')
        return addDnsProfileApiKey(
          env,
          mwOpWallet,
          profile!.id,
          makePublicKey(pkType, pkHex),
          entry.apiKeyValue,
          Array.from(entry.mwauthobj),
        )
      })
    )
  } catch (err) {
    console.error('Profile ddnas api key add error', err)

    if (err instanceof KnownError) {
      return respond(err.statusCode, err.responseJson)
    }

    return respond(500, {
      error:
        'Failed to add profile public keys: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  return respond(200, { success: true })
}
