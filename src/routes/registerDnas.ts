import { makePublicKey } from "../publicKeys";
import { AuthorizedRequest, DbRowProfile, Env, ProfileDnasKeyWithValue, RegisterDnasKeyRequest, RegisterDnasKeyResponse } from "../types";
import { addDnsProfileApiKey, getProfileFromPublicKeyHex, incrementProfileNonce, INITIAL_NONCE, KnownError, saveProfile, verifyDNASWidgetEnabledAndDaoMember, verifyRequestBodyAndGetPublicKey } from "../utils";


export const registerDnasKeys = async (
    {
        parsedBody: {
            data: { auth, dnasApiKeys },
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
        await Promise.all(
            // verify widget is enabled & is dao
            dnasApiKeys.filter((key) => verifyDNASWidgetEnabledAndDaoMember(key.data.dao, key))
                .map((key) => verifyRequestBodyAndGetPublicKey(key))
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

    // Find or create profile.
    let profile: DbRowProfile
    try {
        let _profile: DbRowProfile | null = await getProfileFromPublicKeyHex(
            env,
            publicKey.hex
        )
        // If no profile exists, create one.
        if (!_profile) {
            _profile = await saveProfile(
                env,
                publicKey,
                {
                    nonce: INITIAL_NONCE,
                    name: null,
                    nft: null
                },
                // Create with the current chain preference.
                [auth.chainId]
            )
            // will save api keys to profile after validate & increment
        }
        profile = _profile
    } catch (err) {
        console.error('Profile retrieval', err)
        return respond(500, {
            error:
                'Failed to retrieve existing profile: ' +
                (err instanceof Error ? err.message : `${err}`),
        })
    }

    // Validate all nonces to prevent replay attacks.
    if (
        auth.nonce !== profile.nonce ||
        dnasApiKeys.some((key) => key.data.auth.nonce !== profile!.nonce)
    ) {
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
        dnasApiKeys.reduce(
            (acc, { data }) => {
                const pubKeyKey = `${data.auth.publicKeyType}:${data.auth.publicKeyHex}`

                // Initialize the entry if it doesn't exist
                if (!acc[pubKeyKey]) {
                    acc[pubKeyKey] = {
                        apiKeyValue: data.dnas,
                        daos: new Set<string>()
                    };
                }

                // Add the dao value to the Set
                // Format should be "chainId:daoAddr"
                const daoKey = `${data.auth.chainId}:${data.dao}`
                acc[pubKeyKey].daos.add(daoKey);

                return acc
            }, {} as Record<string, { apiKeyValue: ProfileDnasKeyWithValue; daos: Set<string> }>)
    )

    try {
        await Promise.all(
            dnasKeysToAdd.map(([publicKey, entry]) => {
                const [publicKeyType, publicKeyHex] = publicKey.split(':');
                return addDnsProfileApiKey(
                    env,
                    profile!.id,
                    makePublicKey(publicKeyType, publicKeyHex),
                    entry.apiKeyValue,
                    Array.from(entry.daos)
                );
            })
        );
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