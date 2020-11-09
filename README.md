# SSB meta feed

Status: Design phase

Feeds in SSB are the main abstraction. It is possible to engtangle
multiple feeds by referencing messages in other feeds, but otherwise
feeds are independant. Furthermore there is no concept of any kind of
metadata about a feed. This could be the lifetime of a feed, what the
feed is about, the format of the messages or other things people might
come up with.

Over time a number of different use cases for reasoning about how
multiple feeds relates has come up. This includes same-as where
multiple devices has independant feeds, but can be seen as belonging
to the same physical person. This includes feed rotation for switching
to a newer message type. Or it might be being able to say something
about a subset of messages from a feed (a claim), that will enable
partial replication of those messages.

While adding a new core abstraction to SSB can be seen as a big
change, we believe the abstraction adds enough expressive power that
it makes up for this.

A meta feed consists of a master key and a state. The master key is
the only key able to update the state. State is defined as a number of
feeds with a identifier and a set of metadata fields. The metadata
fields are left open to the implementation.

FIXME: define what the state is exactly and how it is updated

Once you start talking about multiple feeds that might relate to the
same thing (say contact messages of a feed) is becomes very important
what the purpose of the feeds are and how they are stored so you don't
end up with duplicate messages.

Let us see how we can use the above abstraction to solve several
common examples:

## Same-as

Same-as could work by adding the different feeds to the meta feed and
assigning them metadata that would define them all as active. If a
device is lots it is simply removed from the state. This of course
assumes that the master key is stored in a safe place and is never
lost.

## New feed format

Changing to a new feed format could be implemented by adding a new
feed to the state and assigning that as active. Assuming one would
still want to keep updating the old feed for backwards compability
with some clients, newer clients could store multiple feeds for
replication purposes and only write one of them to their log. Lower
end clients could offload this extra storage requirement to larger
peers in the network.

## Claims

If one would like to replicate a specific part of a feed, such as the
contact messages, one could request another peer to generate a feed
that only contains these messages. This would only act as a claim,
never a proof that messages was not left out. Naturally here we come
down to trust. Using the friend graph would be natural, as would
having multiple author staking claims and entangling these.

## Subfeed

Similar to claims it would be possible to create subfeeds that would
only contain certain messages. This might be useful for specific apps
or other use cases. Another use case for this would be curated
content, where specific messages are picked out that might be of
particular interesting to a certain application or specific people.

## Ephemeral feeds

Using the metadata it would be possible to attach a lifetime to feeds,
meaning honest peers would delete the feeds after a specific time.

## Allow list

Similar to ephemeral feeds it would be possible to attach an allow
list to a feed and only distribute this feed to people on the allow
list. As with ephemeral feeds, this cannot be enforced, but assuming
honst peers would give piece of mind that the data is only stored on a
certain subset of the whole network.

# Acknowledgments and prior work

CFT suggested the use of meta feeds
[in](https://github.com/arj03/ssb-observables/issues/1)
