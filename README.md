# SSB meta feed

Status: Ready for implementation

In classical SSB an identity is tied to a single feed. All messages
for different kinds of applications are posted to this single
feed. While it is possible to create multiple feeds, there has been no
formal specification for how these feeds relate and what their
purposes are.

Meta feeds aims to solve these problems by tying an identity to a meta
feed instead. A meta feed referencing other feeds or meta feeds and
contains meta data about the feed including purpose and feed
format. This allows for things like feed rotation to a new feed
format, splitting data into separate feeds and to create special
indexing feeds for partial replication.

A meta feed is tied to a single identity and thus should only be used
on a single device. There is a separate [fusion identity] protocol
that only deals with how to relate multiple devices to a single
identity. This spec is not for that.

Meta feeds will use a specialized [feed
format](https://github.com/ssb-ngi-pointer/bipfy-badger-spec) that
aims be very easy to implement. The aim is that this will make it
easier for implementations that does not need to support the classical
SSB format.

## Example of a meta feed

An example of a meta feed with 2 feeds: a main social feed and an 
applications meta feed.

![Diagram](./metafeed-example1.svg)
<details>
digraph metafeed {

  rankdir=RL
  node [shape=record];
  
  edge [tailclip=false];
  a [label="{ <ref> | <data> main }"]
  b [label="{ <ref> | <data> applications }"];
  b:ref:a -> a:data [arrowhead=vee, arrowtail=dot, dir=both];
}
</details>

Contents of the messages in the meta feed that acts as meta data for
feeds:

```
{ 
  type: 'metafeed/add', 
  feedformat: 'classic', 
  feedpurpose: 'main', 
  subfeed: '@main',
  tangles: {
    metafeed: { root: null, previous: null }
  },
  ...
},
{ 
  type: 'metafeed/add', 
  feedformat: 'bamboo', 
  feedpurpose: 'applications', 
  subfeed: '@applications',
  ...
}
```

Initially two operations are supported: `add` and `tombstone`. Note,
signatures (see key management section) are left out in the examples
here.

Tombstoning means that the feed is no longer part of the meta
feed. Whether or not the sub feed itself is tombstoned is a separate
concern.

Example tombstone message:

```
{ 
  type: 'metafeed/tombstone',
  subfeed: '@applications',
  reason: '',
  tangles: {
    metafeed: { root: %addmsg, previous: %addmsg }
  }
}
```

Updating the metadata on a feed in a meta feed is currently not
supported.

## Applications example

An example of the applications meta feed with two different
applications.

![Diagram2](./metafeed-example2.svg)
<details>
digraph Applications {

  rankdir=RL
  nodesep=0.6
  node [shape=record];

  edge [tailclip=false];
  a [label="{ <ref> | <data> App1 }"]
  b [label="{ <ref> | <data> App2 }"];
  
  b:ref:a -> a:data [arrowhead=vee, arrowtail=dot, dir=both];
}
</details>

```
{ 
  type: 'metafeed/add', 
  feedformat: 'classic', 
  feedpurpose: 'gathering' 
  subfeed: '@app1',
  ...
},
{ 
  type: 'metafeed/add', 
  feedformat: 'classic', 
  feedpurpose: 'chess' 
  subfeed: '@app2',
  ...
}
```

## Key management, identity and metadata

As mentioned earlier, in classical SSB the feed identity is the same
as the feed. Here instead we want to decouple the identity and feeds.

### Existing SSB identity

To generate a meta feed and link that to the main feed, first a seed
is generated:

```
const seed = crypto.randomBytes(32)
```

From this seed, a meta feed can be generated using:

```
const prk = hkdf.extract(lhash, hash_len, seed, salt)
const mf_info = "ssb-meta-feed-seed-v1:metafeed"
const mf_seed = hkdf.expand(hash, hash_len, prk, length, mf_info)
const mf_key = ssbKeys.generate("ed25519", mf_seed)
```

We then encrypt the seed as a private message to the main feed. 

```
{
  type: 'metafeed/seed',
  metafeed: '@metafeed',
  seed: <base64_encoded_seed>
}
```

By doing this we allow the main feed to reconstruct the meta feed and
all sub feeds from this seed.

Then the meta feed is linked with the main feed using a new message on
the meta feed signed by both the main feed and the meta feed. For
details this see the [feed
format](https://github.com/ssb-ngi-pointer/bipfy-badger-spec).

```
{
  type: 'metafeed/add',
  feedformat: 'clasic',
  feedpurpose: 'main',
  subfeed: '@main',
  metafeed: '@mf', 
  nonce: '<random_32_bit>',
  tangles: {
    metafeed: { root: null, previous: null }
  }
}
```

In order for existing applications to know that a feed supports meta
feeds, a special message is created on the main feed:

```
{ 
  content: {
    type: 'metafeed/announce',
    metafeed: '@mf',
    tangles: {
      metafeed: { root: null, previous: null }
    }
  }
}
```

A feed can only have one meta feed. If for whatever reason an existing
meta feed needs to be superseed, a new message is created pointing to
the previous `metafeed/announce` message.

### New SSB identity

A new identity starts by constructing a seed. From this seed both the
meta feed keys and the main feed keys are generated. The main should
use the info: "ssb-meta-feed-seed-v1:" + base64 encoded nonce of the
message on the meta feed.

The seed will also be encrypted to the main feed and the meta feed
linked to the main feed just like for existing feeds.

### Identity backwards compatibility

By building a layer on top of existing feeds we maintain backwards
compatible with existing clients. The identity to be used by new 
applications should be that of the meta feed. For backwards 
compatibility contact messages forming the follow graph together with
secret handshake will continue to use the key of the main feed.

It is worth noting that even though the examples above specify ways to
generate new feeds from a single seed, it is perfectly fine and in
some cases a better idea to generate a feed not from this seed. Thus
in the case the main key being broken or stolen, you don't loose
everything.

If a key is reused in another part of the tree it must include a
reference to the original sub feed or meta feed it was defined in. The
original place is the authorative place for its metadata.

Using [BIP32-Ed25519] instead was considered but that method has a
weaker security model in the case of a key compromised where keys are
shared between devices.

## Use cases

Let us see how we can use the above abstraction to solve several
common examples:

### New feed format

Changing to a new feed format could be implemented by adding a new
feed to the meta feed state, and by adding a tombstone message to the
old feed pointing and assigning the new feed as active in the meta
feed.

In case of backwards compability with clients that does not support a
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

### Sub feeds

Similar to claims it would be possible to create sub feeds that would
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

## Open questions

- In the case of claims, how are bad actors handled?
- What are the broader consequences of ephemeral feeds. Maybe they can
only be used in limited circumstances, and if so which ones?
- For sub feeds and feed rotation what is the best way to handle
  potentially overlapping messages

## Acknowledgments and prior work

CFT suggested the use of meta feeds
[in](https://github.com/arj03/ssb-observables/issues/1)

[BIP32-Ed25519]: https://github.com/wallet-io/bip32-ed25519/blob/master/doc/Ed25519_BIP.pdf
[ssb-secure-partial-replication]: https://github.com/ssb-ngi-pointer/ssb-secure-partial-replication
[fusion identity]: https://github.com/ssb-ngi-pointer/fusion-identity-spec/
