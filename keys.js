const crypto = require("crypto")
// use https://www.npmjs.com/package/derive-key instead
const hkdf = require('futoin-hkdf')
const ssbKeys = require('ssb-keys')

const length = 32

const ikm = crypto.randomBytes(length) // aka as seed

// or from backup:
/*
const ikm_hex = '1fd53bb951cc1ca41d1efce5c2710bc0b61c32c8fff6b774166490fc086254c9'
const ikm = Buffer.from(ikm_hex, 'hex')
*/

console.log("seed", ikm.toString('hex'))

const salt = 'ssbc'
const hash = 'SHA-256'

const lhash  = 'sha256'
const hash_len = hkdf.hash_length(lhash)
const prk = hkdf.extract(lhash, hash_len, ikm, salt)

const mf_info = "ssb-meta-feed-seed-v1:metafeed"
//const mf_seed = hkdf(ikm, length, {salt, mf_info, hash})
const mf_seed = hkdf.expand(lhash, hash_len, prk, length, mf_info);

console.log("mf seed", mf_seed)

const mf_key = ssbKeys.generate("ed25519", mf_seed)
console.log("mf_key", mf_key)

const sf_info = "ssb-meta-feed-seed-v1:subfeed-1"

const sf_seed = hkdf.expand(lhash, hash_len, prk, length, sf_info);

console.log("sf_seed", sf_seed)

const sf_key = ssbKeys.generate("ed25519", sf_seed)
console.log("sf_key", sf_key)
