<!--
SPDX-FileCopyrightText: 2021 Anders Rune Jensen

SPDX-License-Identifier: CC-BY-4.0
-->

# ssb-meta-feeds-spec

Version: 1.0

Status: Ready for implementation

Author: Anders Rune Jensen

License: This work is licensed under a Creative Commons Attribution 4.0 International License.

## Abstract

In classical SSB an identity is tied to a single feed. All messages
for different kinds of applications are posted to this single
feed. While it is possible to create multiple feeds, there has been no
formal specification for how these feeds relate and what their
purposes are.

Metafeeds aim to solve these problems by tying an identity to a metafeed
instead. A metafeed references other feeds (or even metafeeds) and
contains metadata about the feed including purpose and feed
format. This allows for things like feed rotation to a new feed
format, splitting data into separate (sub)feeds and to create special
indexing feeds for partial replication.

A metafeed is tied to a single identity and thus should only be used
on a single device. There is a separate [fusion identity] protocol
that only deals with how to relate multiple devices to a single
identity. This spec here is not for that use-case.

To understand how a classic SSB implementation can be migrated to
support metafeeds see the [migration spec].

Metafeeds will use a specialized feed format known as [bendy butt]
that aims to be very easy to implement. The aim is that this will make
it easier for implementations which do not need or want to support the
classical SSB format.

## Definitions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in RFC 2119.

We use bencode and [BFE] notations as defined in the [bendy butt]
spec.

## Overview

The metafeed of a device consist of 1 root metafeed. This metafeed can
reference other feeds by adding messages to this feed. There are only
4 message types or operations:

 - add existing feed
 - add new feed
 - update metadata of a feed
 - tombstone a feed

From these operations a number of active feeds are defined together
with their metadata. By adding other metafeeds, a tree structure can
be defined. A feed MUST only exist in one place within this structure.

As defined in the usage of Bendy Butt feed format section, there are a
number of specific fields that must be defined. Any other fields on a
message are considered metadata. 

Example of adding an existing feed:

```
{
  "type" => "metafeed/add/existing",
  "feedpurpose" => "main",
  "subfeed" => (BFE-encoded feed ID for the 'main' feed),
  "metafeed" => (BFE-encoded Bendy Butt feed ID for the metafeed),
  "tangles" => {
    "metafeed" => {
      "root" => null,
      "previous" => null
    }
  },
}
```

Here the application specific metadata `feedpurpose` is used.

### v1

While metafeeds is a general way to structure feeds into a tree, a
particular way of organizing the tree is defined in this section. We
use a `v1` versioning subfeed under the root metafeed and define the
structure this must follow in this section. This allows an upgrade
path to v2 or other structures in the future.

To start with, the `v1` versioning subfeed **MUST** be created with
the following `content` on the root metafeed:

```
{
  "type" => "metafeed/add/derived",
  "feedpurpose" => "v1",
  "subfeed" => (BFE-encoded feed ID dedicated for the versioning subfeed),
}
```

The feed format for `v1` **MUST** be [bendy butt], because it is a
metafeed.

The *direct* subfeeds of `v1` are the so-called *shard feeds*. The
actual application-specific subfeeds are under the shard
feeds. Sharding is based on 4 bits of entropy extracted from the
application-specific subfeed, and can be represented by 1 hexadecimal
digit. We will call that digit the "nibble".  The nibbles are: `0`,
`1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `a`, `b`, `c`, `d`, `e`,
`f`. The number of shards is specifically set at 16 to allow for
efficient partial replication in realistic scenarios. See [sharding
math](./sharding-math.md) for mathematical details on the choice of
number of shards.

The purpose of the shard feeds is to allocate the set of
application-specific subfeeds into 16 separate groupings of feeds,
i.e. one for each nibble. This way, if you are only interested in
replicating a subset of the application-specific subfeeds, you can
deterministically calculate the nibble for those application-specific
subfeeds, and then you know which shard feeds to replicate.

When adding a new application-specific subfeed to the tree, we need to
determine the parent shard based on a "name", which is any UTF-8
string that the application can choose freely, but it is
**RECOMMENDED** that this string be unique to the use case. Then, the
shard feed's nibble is calculated as the first hexadecimal digit of
the following SHA256 hash:

```
sha256_hash(concat_bytes(root_metafeed_id, name))
```

where `root_metafeed_id` is the BFE-encoded ID of the root metafeed,
and `name` is a BFE-encoded UTF-8 string.

The nibble is then used to create a new shard feed, unless there is
already one. There **MUST** be at most *one* shard feed for every
unique nibble. The `content` on the root's message for the shard feed
**MUST** have the nibble expressed in hexadecimal and encoded as a
string in the `feedpurpose` field of the `metafeed/add/derived`
message. The feed format for a shard feed **MUST** be [bendy butt],
because they are metafeeds.

Once the shard feed is created, the application-specific subfeeds can
be added as subfeeds of that one, either as `metafeed/add/derived` or
`metafeed/add/existing`.

The following diagram is an example of the organization of subfeeds
under the v1 specification:

```mermaid
graph TB;
  root --> v1
  v1 --> 8 & a & c & 3
  8 --> post
  a --> gathering
  a --> chess
  c --> vote
  3 --> contact
```

Application-specific subfeeds are leafs in the tree, and they **MUST
NOT** be metafeeds that contain other application-specific
subfeeds. This restriction can vastly simplify implementations, and we
don't see a clear need for doing otherwise. If the need arises, we can
allow such cases in the next versions for the tree structure.

## Key management

This sections covers how to handle the keys used when working with
metafeeds.

### Existing SSB identity

This section is only relevant for migrating from a classic SSB feed to
metafeeds.

To create a metafeed and link it to an existing `main` feed, first a
seed is generated:

```js
const seed = crypto.randomBytes(32)
```

From this seed, a metafeed can be generated using:

```js
const salt = 'ssb'
const prk = hkdf.extract(lhash, hash_len, seed, salt)
const mf_info = "ssb-meta-feed-seed-v1:metafeed"
const mf_seed = hkdf.expand(hash, hash_len, prk, length, mf_info)
const mf_key = ssbKeys.generate("ed25519", mf_seed)
```

Note we use `metafeed` here in the info. As the top/genesis metafeed
is special we use that string, for all other derived feeds a nonce is
used, which is also published in the corresponding
`metafeed/add/derived` message.

We also encrypt the seed as a private message from `main` to `main`
(so it's a private message to yourself; notice this is JSON, because
it's published on the main):

```
{
  "type": "metafeed/seed",
  "metafeed": ssb:feed/bendybutt-v1/bendyButtFeedID,
  "seed": seedBytesEncodedAsHexString
}
```

By doing so we allow the existing feed to reconstruct the metafeed and
all subfeeds from this seed.

Then the metafeed is linked with the existing `main` feed using a new
message on the metafeed signed by both the `main` feed and the meta
feed. For details this see [bendy butt].

```
{
  "type" => "metafeed/add/existing",
  "feedpurpose" => "main",
  "subfeed" => (BFE-encoded feed ID for the 'main' feed),
  "metafeed" => (BFE-encoded Bendy Butt feed ID for the metafeed),
  "tangles" => {
    "metafeed" => {
      "root" => (BFE nil),
      "previous" => (BFE nil)
    }
  }
}
```

In order for existing applications to know that the existing feed
supports metafeeds, a special message of type `metafeed/announce` is
created on the `main` feed (notice this is JSON, because the main feed
is not in Bendy Butt):

```js
{
  // ... other msg.value field ...
  content: {
    type: 'metafeed/announce',
    metafeed: 'ssb:feed/bendybutt-v1/-oaWWDs8g73EZFUMfW37R_ULtFEjwKN_DczvdYihjbU=',
    subfeed: MAIN_FEED_ID,
    tangles: {
      metafeed: {
        root: null,
        previous: null
      }
    },
    signature: SIGNATURE_OF_THE_ABOVE
  }
}
```

Note that MAIN_FEED_ID is the ID of the main feed, and that
SIGNATURE_OF_THE_ABOVE is the signature (using the metafeed keys) of
the stringified `content` *without* `content.signature` itself, in a
similar manner to how the message signature `msg.value.signature` is
constructed relative to `msg.value`. So `msg.value.signature` is
signed with the `main` feed's keys, but `msg.value.content.signature`
is signed with the *metafeed keys*.

A feed can only have **one** metafeed. If for whatever reason an
existing metafeed needs to be superseed, a new message is created
pointing to the previous `metafeed/announce` message via the tangle.

### New metafeed

A new client without an existing classic SSB feed can start from this
section.

A new identity starts by constructing a seed. From this seed the
metafeed keys can be created as described in the existing SSB identity
section above.

The seed should be safely backed up.

## Usage of Bendy Butt feed format

Metafeeds **MUST** use the [bendy butt] feed format with a few
additional constraints.

The `content` dictionary inside the `contentSection` of meta feed
messages **MUST** conform to the following rules:

 - Has a `type` field mapping to a BFE string (i.e. `<06 00> + data`)
 which can assume only one the following possible values:
   - `metafeed/add/existing`
   - `metafeed/add/derived`
   - `metafeed/update`
   - `metafeed/tombstone`
 - Has a `subfeed` field mapping to a BFE "feed ID", i.e. `<00> +
   format + data`
 - Has a `metafeed` field mapping to a BFE "Bendy Butt feed ID", i.e.
 `<00 03> + data`
 - (Only if the `type` is `metafeed/add/derived`): a `nonce` field
   mapping to a BFE "arbitrary bytes" with size 32, i.e. `<06 03> +
   nonce32bytes`

The `contentSignature` field inside a decrypted `contentSection`
**MUST** use the `subfeed`'s cryptographic keypair.

## Use cases

Let us see how we can use the above abstraction to solve several
common examples:

### New feed format

Changing to a new feed format could be implemented by adding a new
feed to the metafeed state, and by adding a tombstone message to the
old feed pointing and assigning the new feed as active in the meta
feed.

In case of backwards compability with clients that do not support a
newer feed format or in the case of only wanting to support newer feed
formats, maintaining muliple feeds with the same content would be an
interesting avenue to explore. As the hash of the messages in the two
feeds would be different, there could be a way to include the hash of
the corresponding message in old feed in the newer feed.

Lower end clients could offload this extra storage requirement to
larger peers in the network.

### Claims or indexes

For classical SSB feeds if one would like to replicate a specific part
of a feed, such as the contact messages, one could request another
peer to generate a feed that only references these messages. Then when
exchanging data, the original messages could be included as auxiliary
data. This would only act as a claim, never as a proof that some
messages were not left out. Naturally this comes down to trust
then. Using the friend graph would be natural, as would using trustnet
together with audits of these claims.

### Subfeeds

Similar to claims it would be possible to create subfeeds that would
only contain certain messages. This might be useful for specific
apps. Another use case for this would be curated content, where
specific messages are picked out that might be of particular interest
to a certain application or specific people, or say messages within
the last year.

### Ephemeral feeds

Using the metadata it would be possible to attach a lifetime to feeds,
meaning honest peers would delete the feeds after a specific
time. This would enable applications to generate a short lived feed
only for the communication between two parties.

### Allow list

Similar to ephemeral feeds it would be possible to attach an allow
list to a feed and only distribute this feed to people on the allow
list. As with ephemeral feeds, this cannot be enforced, but assuming
honest peers would give piece of mind that the data is only stored on
a certain subset of the whole network. This can naturally be combined
with private groups to better ensure safety.

## Acknowledgments and prior work

CFT [suggested the use of metafeeds in connection to ssb-observables](https://github.com/arj03/ssb-observables/issues/1).

[fusion identity]: https://github.com/ssb-ngi-pointer/fusion-identity-spec/
[bencode]: https://en.wikipedia.org/wiki/Bencode
[BFE]: https://github.com/ssbc/ssb-bfe-spec
[bendy butt]: https://github.com/ssb-ngi-pointer/bendy-butt-spec
[migration spec]: https://github.com/ssbc/ssb-meta-feeds-migration
