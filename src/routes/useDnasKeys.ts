import { fromBech32, toHex } from "@cosmjs/encoding";
import { makePublicKey } from "../publicKeys";
import { AuthorizedRequest, Env, FileMetadata, UseDnasKeyRequest, UseDnasKeyResponse } from "../types";
import { getDnasParamms, getIsDaoMember } from "../utils/dao";
import { getDnasApiKeyValue, getProfileDnasApiKeys, getProfileFromAddressHex } from "../utils";
import { JackalErrorResponse, JackalSuccessResponse } from "../utils/jackal";


export const useDnasKeys = async (
    request: AuthorizedRequest<UseDnasKeyRequest>,
    env: Env
) => {

    const {
        parsedBody: { data },
        publicKey,
    } = request;
    console.log("Starting useDnasKeys function");
    const respond = (status: number, response: UseDnasKeyResponse) =>
        new Response(JSON.stringify(response), {
            status,
        })
    // Validate public key.
    const dnasChainpublicKey = makePublicKey(
        data.auth.publicKeyType,
        data.auth.publicKeyHex
    )
    const signer = dnasChainpublicKey.getBech32Address(data.auth.chainBech32Prefix)
    console.log("signer", signer)
    const daoMember = await getIsDaoMember(data.auth.chainId, signer, data.dao)
    if (!daoMember) {
        return respond(500, {
            error: 'Addr is is not member of DAO: '
        })
    }

    // confirm dao has widget enabled
    const dnsParams = await getDnasParamms(data.auth.chainId, data.dao)
    console.log("DNAS PARAMS FOUND", dnsParams)

    // get profile for member 
    const bech32Address = data.keyOwner.trim()
    const addressHex = toHex(fromBech32(bech32Address).data)

    const profile = await getProfileFromAddressHex(env, addressHex)
    if (!profile) {
        return respond(500, {
            error: 'Dao member has not registered a profile for Dnas support.'
        })
    }

    const profileDnasApiKeys = await getProfileDnasApiKeys(env, profile.id)

    // - key owner has registered a key to this dao
    const thisDnasApi = profileDnasApiKeys.find((key) =>
        key.row.chainId === data.auth.chainId && key.row.daoAddr === data.dao
    );
    if (!thisDnasApi) {
        return respond(500, {
            error: 'Dao member has no dnas api key for this DAO.'
        })
    }
    console.log("THIS DAO SPECIFIC DNAS API KEY FOUND", thisDnasApi)

    //  get the actual api key
    let apiKey = await getDnasApiKeyValue(env, thisDnasApi.row.id)
    if (!apiKey) {
        return respond(500, {
            error: 'Unable  to resolve apiKey.'
        })
    }


    try {
        // Create a new FormData for the outgoing request
        const outgoingForm = new FormData();
        // Use the files metadata from the parsed body
        for (let i = 0; i < data.files.length; i++) {
            const file = data.files[i];
            outgoingForm.append("files", file);
        }

        // Better error handling with async/await
        const options = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${Buffer.from(apiKey, 'base64').toString('utf-8')}`
                // Note: Don't set Content-Type header when using FormData,
                // the browser will set it automatically with the boundary
            },
            body: outgoingForm // Include the FormData as the request body
        };
        console.log("got this far, we are hitting the jackal api...")
        const response = await fetch('https://pinapi.jackalprotocol.com/api/v1/files', options);
        if (response.ok) {
            const res: JackalSuccessResponse = await response.json();
            console.log(res)
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