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

    const respond = (status: number, response: UseDnasKeyResponse) =>
        new Response(JSON.stringify(response), {
            status,
        })


    console.log("dnas.data.auth.publicKeyType", data.auth.publicKeyType)
    console.log("dnas.data.auth.publicKeyHex", data.auth.publicKeyHex)

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

    const testQuery = await env.DB.prepare("SELECT 1 as test").first();
    console.log("DB connection test:", testQuery);
    
    // get profile for member 
    const bech32Address = data.keyOwner.trim()
    const addressHex = toHex(fromBech32(bech32Address).data)
    console.log("Looking up with addressHex:", addressHex);
    const profile = await getProfileFromAddressHex(env, addressHex)
    if (!profile) {
        return respond(500, {
            error: 'Dao member has not registered a profile for Dnas support.'
        })
    }

    const profileDnasApiKeys = getProfileDnasApiKeys(env, profile.id)
    const apiKeys = await profileDnasApiKeys;
    console.log("DNAS API KEY FOUND", apiKeys)

    // - key owner has registered a key to this dao
    const thisDnasApi = (apiKeys).find((key) => { key.row.chainId == data.auth.chainId })
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
    console.log("API KEY RESOLVED");


    try {
        // Check if request has formData method
        if (!request.formData) {
            return respond(400, {
                error: "Request doesn't support formData. Make sure to send files as multipart/form-data."
            });
        }
        // Get the files from the incoming request
        const formData = await request.formData();

        // Create a new FormData for the outgoing request
        const outgoingForm = new FormData();

        // Match files in the form with the metadata provided in the request body
        for (let i = 0; i < data.files.length; i++) {
            const metadata = data.files[i];
            const fileKey = `file_${i}`; // The key used in the incoming request
            const file = formData.get(fileKey);
            if (!file || !(file instanceof File)) {
                return respond(400, {
                    error: `File ${metadata.name} not found in the request`
                });
            }

            // Verify that the metadata matches the actual file
            if (file.name !== metadata.name || file.size !== metadata.size ||
                file.type !== metadata.contentType) {
                console.warn(`File metadata mismatch for ${metadata.name}`);
                // You may choose to fail or continue with a warning
            }

            // Add the file to the outgoing request
            outgoingForm.append(`files.${i}`, file);
        }

        // Better error handling with async/await
        const options = { method: 'POST', headers: { Authorization: Buffer.from(apiKey, 'base64').toString('utf-8') }, };

        console.log("got this far, we are hitting the jackal api...")
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