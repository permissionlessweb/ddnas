import { fromBech32, toHex } from '@cosmjs/encoding'
import { Request, RouteHandler } from 'itty-router'

import { makePublicKey } from '../publicKeys'
import {
  DbRowProfile,
  DnasKeyRecord,
  Env,
  FetchProfileResponse,
  FetchedProfile,
} from '../types'
import {
  INITIAL_NONCE,
  getOwnedNftWithImage,
  getProfileDnasApiKeys,
  getProfileFromAddressHex,
  getProfileFromPublicKeyHex,
  getProfilePublicKeyPerChain,
  mustGetChain,
} from '../utils'

export const fetchProfile: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: FetchProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  // via public key
  let publicKey = request.params?.publicKey?.trim()
  // via address hex
  let addressHex = request.params?.addressHex?.trim()
  // via bech32 address
  const bech32Address = request.params?.bech32Address?.trim()

  // Fetched profile response. Defaults to the empty profile.
  const profile: FetchedProfile = {
    uuid: '',
    nonce: INITIAL_NONCE,
    name: null,
    nft: null,
    chains: {},
  }

  let profileRow: DbRowProfile | null = null
  try {
    // If no public key nor address hex is set, get address hex from bech32
    // address.
    if (!publicKey && !addressHex && bech32Address) {
      addressHex = toHex(fromBech32(bech32Address).data)
    }

    if (publicKey) {
      profileRow = await getProfileFromPublicKeyHex(env, publicKey)
    } else if (addressHex) {
      profileRow = await getProfileFromAddressHex(env, addressHex)
    }
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // If profile found, load into fetched profile response.
  if (profileRow) {
    profile.uuid = profileRow.uuid
    profile.nonce = profileRow.nonce
    profile.name = profileRow.name?.trim() || null

    // Get chains and DNA API keys.
    const publicKeysPerChain = await getProfilePublicKeyPerChain(
      env,
      profileRow.id
    )
    const ddnas = await getProfileDnasApiKeys(env, profileRow.id)

    // Process the ddnas to map them by daoAddr
    const dnasByChainAndDaoAddr = ddnas.reduce<Record<string, DnasKeyRecord>>(
      (acc, dna) => {
        const chainIdKey = String(dna.row.chainId)

        // Initialize the chain record if it doesn't exist
        if (!acc[chainIdKey]) {
          acc[chainIdKey] = {}
        }

        // Add the DNAS record with the daoAddr as key
        acc[chainIdKey][dna.row.daoAddr] = {
          chainId: String(dna.row.chainId),
          keyHash: String(dna.row.keyHash),
          keyOwner: String(dna.row.keyOwner),
          keyMetadata: String(dna.row.keyMetadata),
          // Only include uploadLimit if it exists
          ...(dna.row.uploadLimit !== undefined && dna.row.uploadLimit !== null
            ? { uploadLimit: String(dna.row.uploadLimit) }
            : {}),
        }

        return acc
      },
      {}
    )

    // Build the chains object
    const accountPerChain = publicKeysPerChain.map(
      async ({ chainId, publicKey }) => {
        const bech32Prefix = mustGetChain(chainId).bech32_prefix
        const daoMemberAddress = await publicKey.getBech32Address(bech32Prefix)

        return [
          chainId,
          {
            dnas: dnasByChainAndDaoAddr[chainId] || {},
            daoMemberPublicKey: publicKey.json,
            daoMemberAddress,
          },
        ] as const
      }
    )

    // Convert to object and filter out failures
    profile.chains = Object.fromEntries(
      (await Promise.allSettled(accountPerChain))
        .filter(
          (result): result is PromiseFulfilledResult<readonly [string, any]> =>
            result.status === 'fulfilled'
        )
        .map((result) => result.value)
    )

    // Verify selected NFT still belongs to the public key before responding
    // with it. On error, just ignore and return no NFT.
    if (
      profileRow.nftChainId &&
      profileRow.nftCollectionAddress &&
      profileRow.nftTokenId
    ) {
      try {
        // Get profile's public key for the NFT's chain, and then verify that
        // the NFT is owned by it.
        const publicKey = profile.chains[profileRow.nftChainId]?.publicKey
        if (publicKey) {
          profile.nft = await getOwnedNftWithImage(
            env,
            makePublicKey(publicKey.type, publicKey.hex),
            {
              chainId: profileRow.nftChainId,
              collectionAddress: profileRow.nftCollectionAddress,
              tokenId: profileRow.nftTokenId,
            }
          )
        }
      } catch (err) {
        console.error('Failed to get NFT image', err)
      }
    }
  }

  return respond(200, profile)
}
