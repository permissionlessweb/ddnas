-- Profile
DROP TABLE IF EXISTS profiles;

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  nonce INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  nftChainId TEXT,
  nftCollectionAddress TEXT,
  nftTokenId TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- unique uuid among all profiles
  CONSTRAINT unique_uuid UNIQUE (uuid),
  -- unique name among all profiles
  CONSTRAINT unique_name UNIQUE (name)
);

-- ProfilePublicKey
DROP TABLE IF EXISTS profile_public_keys;

CREATE TABLE profile_public_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profileId INTEGER NOT NULL,
  type TEXT NOT NULL,
  publicKeyHex TEXT NOT NULL,
  addressHex TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE,
  -- unique public key, only one profile can claim a given public key
  CONSTRAINT unique_type_public_key_hex UNIQUE (type, publicKeyHex)
);

CREATE INDEX IF NOT EXISTS idx_profile_public_keys_public_key_hex ON profile_public_keys(publicKeyHex);

-- ProfilePublicKeyChainPreference
DROP TABLE IF EXISTS profile_public_key_chain_preferences;

CREATE TABLE profile_public_key_chain_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profileId INTEGER NOT NULL,
  profilePublicKeyId INTEGER NOT NULL,
  chainId TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_public_keys FOREIGN KEY (profilePublicKeyId) REFERENCES profile_public_keys (id) ON DELETE CASCADE,
  -- only one preference for a given chain per profile
  CONSTRAINT unique_profile_chain_preference UNIQUE (profileId, chainId)
);

CREATE INDEX IF NOT EXISTS idx_profile_public_key_chain_preferences_profile_chain ON profile_public_key_chain_preferences(profileId, chainId);

-- Profile DNAS API Key Preference
DROP TABLE IF EXISTS profile_dnas_api_key_preferences;
CREATE TABLE profile_dnas_api_key_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profileId INTEGER NOT NULL,
  dnasApiKeyId INTEGER NOT NULL,
  chainId TEXT NOT NULL,
  daoAddr TEXT NOT NULL,
  isPreferred BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraints
  CONSTRAINT fk_profiles FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_dnas_api_keys FOREIGN KEY (dnasApiKeyId) REFERENCES dnas_api_keys (id) ON DELETE CASCADE,
  
  -- Only one preferred API key per profile per chain per DAO
  CONSTRAINT unique_profile_chain_dao_preference UNIQUE (profileId, chainId, daoAddr)
);

-- Create a single index for the combined fields
CREATE INDEX idx_profile_chain_dao ON profile_dnas_api_key_preferences (profileId, chainId, daoAddr);

-- DNAS SPECIFIC 
--  todo: make sure we are setting the apikey hash value as the key to access the actual value in the db
-- DnasApiKey table with additional fields
DROP TABLE IF EXISTS dnas_api_keys;
CREATE TABLE dnas_api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profileId INTEGER NOT NULL,
    type TEXT NOT NULL,
    keyMetadata TEXT,
    signatureLifespan TEXT,
    uploadLimit TEXT,
    apiKeyHash VARBINARY(32), -- Will store SHA-256 hash of the API key
    chainId TEXT NOT NULL,    -- Added to store which blockchain chain this key is for
    daoAddr TEXT NOT NULL,    -- Added to store which DAO address this key is for
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Foreign key constraint
    CONSTRAINT fk_profiles FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE,
    -- Updated unique constraint to include chainId and daoAddr
    CONSTRAINT unique_profile_chain_dao UNIQUE (profileId, chainId, daoAddr)
);

-- api_keys table to store the keys and metadata
DROP TABLE IF EXISTS api_keys;
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dnasKeyId INTEGER NOT NULL,
    apiKeyValue VARBINARY NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Foreign key constraint linking to dnas_api_keys
    CONSTRAINT fk_dnas_api_keys FOREIGN KEY (dnasKeyId) REFERENCES dnas_api_keys (id) ON DELETE CASCADE
);
-- Create an index on apiKeyHash for faster lookups
CREATE INDEX idx_apiKeyHash ON dnas_api_keys (apiKeyHash);

-- Create indices for the new fields
CREATE INDEX idx_chainId ON dnas_api_keys (chainId);
CREATE INDEX idx_daoAddr ON dnas_api_keys (daoAddr);
CREATE INDEX idx_profile_chain_dao ON dnas_api_keys (profileId, chainId, daoAddr);

-- Create a trigger to compute and store the SHA-256 hash of the API key
CREATE TRIGGER tr_insert_apiKeyHash
AFTER INSERT ON api_keys
FOR EACH ROW
BEGIN
    UPDATE dnas_api_keys
    SET apiKeyHash = SHA2(NEW.apiKeyValue, 256)
    WHERE id = NEW.dnasKeyId;
END;

-- Create index on encryptedKey for faster lookups
CREATE INDEX IF NOT EXISTS idx_apiKeyValue ON api_keys (apiKeyValue);