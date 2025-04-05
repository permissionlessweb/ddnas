import { fromBech32, toHex } from "@cosmjs/encoding";
import { makePublicKey } from "../publicKeys";
import { AuthorizedRequest, Env, UseDnasKeyRequest, UseDnasKeyResponse } from "../types";
import { getDnasParamms, getIsDaoMember } from "../utils/dao";
import { getDnasApiKeyValue, getProfileDnasApiKeys, getProfileFromAddressHex } from "../utils";
import { JackalErrorResponse, JackalSuccessResponse } from "../utils/jackal";


export const useDnasKeys = async (
    {
        parsedBody: {
            data: { auth, dnas },
        },
        publicKey,
    }: AuthorizedRequest<UseDnasKeyRequest>,
    env: Env
) => {
    const respond = (status: number, response: UseDnasKeyResponse) =>
        new Response(JSON.stringify(response), {
            status,
        })

    // Validate public key.
    const dnasChainpublicKey = makePublicKey(
        dnas.data.auth.publicKeyType,
        dnas.data.auth.publicKeyHex
    )
    const signer = dnasChainpublicKey.getBech32Address(dnas.data.auth.chainBech32Prefix)
    const daoMember = await getIsDaoMember(dnas.data.auth.chainId, signer, dnas.data.dao)
    if (!daoMember) {
        return respond(500, {
            error: 'Addr is is not member of DAO: '
        })
    }

    // - dao has widget enabled,
    const dnsParams = await getDnasParamms(dnas.data.auth.chainId, dnas.data.dao)

    // get profile for member 
    const bech32Address = dnas.data.keyOwner.trim()
    const addressHex = toHex(fromBech32(bech32Address).data)
    const profile = await getProfileFromAddressHex(env, addressHex)
    if (!profile) {
        return respond(500, {
            error: 'Dao member has not registered a profile for Dnas support.'
        })
    }
    const profileDnasApiKeys = getProfileDnasApiKeys(env, profile.id)

    // - key owner has registered a key to this dao
    const thisDnasApi = (await profileDnasApiKeys).find((key) => { key.row.chainId == dnas.data.auth.chainId })
    if (!thisDnasApi) {
        return respond(500, {
            error: 'Dao member has no dnas api key for this DAO.'
        })
    }

    let apiKey = await getDnasApiKeyValue(env, thisDnasApi.row.id)
    if (!apiKey) {
        return respond(500, {
            error: 'Unable  to resolve apiKey.'
        })
    }

    // Append each file individually (assuming files array exists in dnas.data)
    const form = new FormData();
    dnas.data.files.forEach((file: File, index: number) => {
        form.append(`files.${index}`, file, file.name);
    });

    // Better error handling with async/await
    const options = { method: 'POST', headers: { Authorization: Buffer.from(apiKey, 'base64').toString('utf-8'), 'Content-Type': 'multipart/form-data' }, };
    try {
        const response = await fetch('https://pinapi.jackalprotocol.com/api/v1/files', options);
        if (response.ok) {
            const res: JackalSuccessResponse = await response.json();
            return respond(200, {
                success: true,
                cid: res.cid,
                type: res.fileType,
                id: res.fileId
            });
        } else {
            const res: JackalErrorResponse = await response.json();
            return respond(500, {
                error: `Error id: ${response.status}: ${res.message}`
            });
        }
        // 200 == success
        // 401 == unauthoirzed
        // 413 == file too large, key limit reached

    } catch (err) {
        console.error(err);
        return respond(500, {
            error: `Network error: ${err}`
        });
    }
}


// JACKAL  API  
//todo: and file is within params set by key owner. 

// upload multiple files
// const form = new FormData();
// form.append("files", "[\n  null\n]");

// const options = {
//   method: 'POST',
//   headers: {Authorization: 'Bearer <token>', 'Content-Type': 'multipart/form-data'}
// };

// options.body = form;

// fetch('', options)
//   .then(response => response.json())
//   .then(response => console.log(response))
//   .catch(err => console.error(err));


// create new collection 
// const options = {method: 'POST', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{name}', options)
//   .then(response => response.json())
//   .then(response => console.log(response))
//   .catch(err => console.error(err));


// upload multiple files
// const form = new FormData();
// form.append("files", "[\n  null\n]");

// const options = {
//   method: 'POST',
//   headers: {Authorization: 'Bearer <token>', 'Content-Type': 'multipart/form-data'}
// };

// options.body = form;

// fetch('https://pinapi.jackalprotocol.com/api/v1/files', options)
//   .then(response => response.json())
//   .then(response => console.log(response))
//   .catch(err => console.error(err));

// add file to collection 
// const options = {method: 'PUT', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{id}/{fileid}', options)
//   .then(response => response.json())
//   .then(response => console.log(response))
//   .catch(err => console.error(err));

// add collection to collection 
// const options = {method: 'PUT', headers: {Authorization: 'Bearer <token>'}};

// fetch('https://pinapi.jackalprotocol.com/api/collections/{id}/c/{collectionid}', options)
//   .then(response => response.json())
//   .then(response => console.log(response))
//   .catch(err => console.error(err));7