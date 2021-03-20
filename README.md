# SSB meta feed

Status: Design phase

Feeds in SSB are the main abstraction. It is possible to entangle
multiple feeds by referencing messages in other feeds, but otherwise
feeds are independent. Furthermore there is no concept of any kind of
metadata about a feed. This could be the lifetime of a feed, what the
feed is about, the format of the messages or other things people might
come up with.

Over time a number of different use cases for reasoning about how
multiple feeds relate to each other has come up. This includes same-as
where multiple devices have independent feeds, but can be seen as
belonging to the same physical person. Feed rotation for switching to
a newer feed format. Or the ablity to say something about a subset of
messages from a feed (a claim or index), that would enable partial
replication of those messages.

Another aspect of existing feeds in SSB is that they conflate the
identity of the feed together with the contents of the feed.

A meta feed is mainly meant to be used on a single device and is a
special kind of feed that only contains references to and maintains
metadata about other feeds. As such it also has its own keypair that
defines its identity. Naturally a meta feed can also reference other
meta feeds and thus can be used to build a tree. The current state of
a meta feed, meaning what other feeds it references and their state,
is the reduced state of all changes on the feed. Because a meta feed
is just a series of messages they can be private or part of a private
group.

## Example of a meta feed

An example of a meta feed with 3 feeds: a main social feed, an
 applications meta feed and a same-as feed for describing links
 between feeds to create a single virtual identity.

![Diagram](./metafeed-example1.svg)
<details>
digraph metafeed {

  rankdir=RL
  node [shape=record];
  
  edge [tailclip=false];
  a [label="{ <ref> | <data> main }"]
  b [label="{ <ref> | <data> applications }"];
  c [label="{ <ref> | <data> linked }"];
  c:ref:b -> b:data [arrowhead=vee, arrowtail=dot, dir=both];
  b:ref:a -> a:data [arrowhead=vee, arrowtail=dot, dir=both];
}
</details>

Contents of the messages in the meta feed that acts as meta data for
feeds:

```
{ type: 'metafeed/operation', operation: 'add', feedtype: 'classic', purpose: 'main', id: '@main' }
{ type: 'metafeed/operation', operation: 'add', feedtype: 'bamboo', purpose: 'applications', id: '@applications' }
{ type: 'metafeed/operation', operation: 'add', feedtype: 'classic', purpose: 'linked', id: '@linked' }
```

Operation can be: `add`, `update`, `remove`. Update can be used to
overwrite or extend the metadata of a feed. Note the signatures (see
key management section) are left out.

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

Contents of messages describing two feeds where the messages for each
application would reside:

```
{ type: 'metafeed/operation', operation: 'add', feedtype: 'classic', id: '@app1', purpose: 'gathering' }
{ type: 'metafeed/operation', operation: 'add', feedtype: 'classic', id: '@app2', purpose: 'chess' }
```

## Key management, identity and metadata

As mentioned earlier, in classical SSB the feed identity is the same
as the feed. Here instead we want to decouple the identity and feeds.

### Existing SSB feed

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

We then encrypt the seed as a private message to the main feed. By
doing this we allow the main feed to reconstruct the meta feed and all
sub feeds from this seed.

Then the meta feed is linked with the main feed using a new message on
the meta feed signed by both the main feed and the meta feed:

```
MF: [{ 
  content: {
      type: 'metafeed/operation',
      operation: 'add',
      feedtype: 'clasic',
      purpose: 'main',
      id: '@main',
      author: '@mf', 
      nonce: '<rand>', 
      sign_sf: suf_sf.sig
  },
  sig_mf:sig_mf.sig
}]
```

Here sign_sf is a signature by the main feed of the fields above it in
the message (FIXME: precise definition). And sig_mf is the normal
signature of the message on the meta feed.

In order for existing applications to know that a feed supports meta
feeds, a special message is created on the main feed:

```
{ 
  content: {
      type: 'metafeed/announce',
      previous_mf_msg: null,
      id: '@mf',
  }
}
```

### New SSB feed

A new feed starts by constructing a seed. From this seed both the meta
feed and the main feed are generated. The main feed should use the
info: "ssb-meta-feed-seed-v1:subfeed-1".

The seed will also be encrypted to the main feed and the meta feed
linked to the main feed just like for existing feeds.

### Identity

By building a layer on top of existing feeds we maintain backwards
compatible with existing clients. The identity will still be that of
the main feed, this means that the follow graph and secret handshake
will continue to work as before, so in essence what we have added is a
mechanism for creating other feeds and have them linked to the main
feed.

It is worth noting that even though the examples above specify ways to
generate new feeds from a single seed, it is perfectly fine and in
some cases a better idea to generate a feed not from this seed. Thus
in the case the main key being broken or stolen, you don't loose
everything.

If a key is reused in another part of the tree it should include a
reference to the original subfeed or metafeed it was defined in. The
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

### Same-as

While there are different ways to solve the problem of multiple feeds
belonging to the same physical person. We are going to sketch two
possible solutions here in very broad terms.

One solution would be to derive a key for each device from the main
key and transfer those to the devices out of band. Or to simply
collect the device ids. In any case, the main feed would maintain a
subfeed with all the devices listed. The main feed would then be
authorative of which devices constitute same-as.

Another option would be to have each device maintain a list of other
keys they consider same-as. If they are all in agreement the feeds
would be considered the same. This solution leaves out a canonical
name for the aggregated identity.

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
