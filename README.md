# ssb-revisions
mutable documents for secure scuttlebutt

For many applications it is desirable to enable users to edit messages that already have been published. This ranges from being able to fix typos to collaboratively working on a collection of links or updating a TODO list. With mutable documents, the scuttlebutt protocol becomes attractive to a wider range of applications.

Because we use an append-only log as the fundamental database, there is no real mutablility. What we can do however, is publishing updates to previously sent messages, asking clients to display the updated version in place of the original message. ssb-revisions is an attempt of implementing a basic API that enables appications to use mutable messages simply by adding an sbot plugin.

## A tree of revisions

ssb-revisions uses the properties `revisionRoot` and `revisionBranch` of a ssb message to form a tree similar to a git commit tree.
You can overwrite a message's content by publishing a new message specifying the original message's id in both, revisionRoot and revisionBranch. In turn, you can overwrite this new revision you just made, by publishing a new message with revisionRoot pointing to the original message and revisionBranch to the last revision. This is analogue to how scuttlebutt's `root` and `branch` propterties work, but instead of answering to a previous message, revisionRoot and revisionBranch are being used to *edit* a previous message.

## Forks

If two messages refer to the same revisionBranch, they create a fork. These two edits are conflicting; it is unclear, which of the edits should represent the message's new value. The message has two *heads*. Just like in git, a merge is required to resolve such a conflict. You can merge two revisions by publishing yet another revision with revisionBranch refering to *both* of the conflicting heads in an array.
While a conflict is present, ssb-revisions breaks the tie by taking the revisions' timestamp into account. The newer revisions wins.

## Incomplete History

It is possible that messages that are referred to from other messages by revisionRoot or revisionBranch are not available in the log, becaue they are published by authors outside of the user's friend-of-friend bubble. Objects with revisions that contain such dangling references are said to have an "incomplete history".

I use the terms "document" and "object" here interchangeably to refer to the entire tree of revisions spwaning from a original message (the revisionRoot). An object's or document's value is the value of its latest head. 

## Indexing

One of the challenges with mutable messages is indexing. Consider `messagesByType`. Let's say an application wants to render all messages of type `stylesheet` and live-update them whenever a new revision is published. Because there is no guarantee that the type property is not affected by an update, we cannot simply assume that a message that was part of the result set at some point remains in it indefinitely. In contrast to traditional flumeviews, ssb-revision views (ssb-reviews for short) must deal with the case that a messages might be altered in such a way that it is no longer part of the query result.

This problem is solved by calling a view's `map` function twice, once for the new value (as with flumeviews) and a second time with the previous/old value. The differnce between the two return values is used to determine which index entries are still valid and which ones must be removed from the index. In the above example, if a message of type styelsheet is revised and now no longer is a stylesheet, the live stream returned by `ssb.revisions.messagesByType('stylesheet', {live: true})` will emit `{type: 'del', key: ['stylesheet', '%....']}` where '%...' is the revisionRoot (id of the original message) that no longer is part of the query result.

You can use [ssb-review-reduce](https://github.com/regular/ssb-review-reduce) and [ssb-review-level](https://github.com/regular/ssb-review-level) to implement such views. They mostly work like flumeview-reduce and flumeview-level. Instead of using `ssb._flumeUse` you use `ssb.revisions.use` to register such views. See below for more.

### Indexing, behind the scenes

Whenever a new revision is published, all revisions that have the same revisionRoot plus the original message (the message with the key that matches the revisionRoot) are retrieved from the log and sorted by causal order. There will be at least one member of the set that is not referred to by others via revisionBranch, these are the _heads_. If there is more than one head, the tie is broken using the messages timestamp: newer heads win.

An index (or view) stores the last message sequence it has seen. When updating a view, it must be fed with all messages it has not seen upto the latest message in the log. When updating a view, we calculate the head at the time the view was last updated, by filtering the set of revisions down to those with sequence numbers lower or equal to the view's `since` value.

We call the view's map function with this old value, to learn what entries it emitted for that document the last time it was updated. Then we calculate the head again, this time including all revisions we know about and call `map` again. The difference of the results of the two invocations of `map` tell us which entries must be deleted from the index. All other entries are updated (overwritten) to now point to the sequence number of the latest revision.

As a result, it is trivial to implement application code that, for example, renders all documents of type 'stylesheet', updates the DOM whenever they change and removes them when they no longer are of that type. All you need is `ssb.revision.messagesByType('stylesheet', {live: true})`.


## Installation

Make sure sbot is running, do

`$ sbot plugins.install ssb-revisions`

and restart sbot. Check if things are working with:

`$ sbot revisions.stats`

## API

### `revisions.stats({live})`

get statistics

```
{
  forked: n,       // number of objects with multiple heads
  incomplete: n,  // number of objects with missing revisions
}
```

### `revisions.get(key, {values, meta}, cb)`

get original or message by key. `key` can be a revRoot or a revision.

The difference to `ssb.get()` is that it won't callback until the key is found,
hoping that gossipping will make it available eventually. If you don't want to wait, just
use `ssb.get`.

```
{
  meta: {
    original: bool, // original or revision?
    old: bool,  // did it exist when we called or did we wait for it?
  },
  value: {
    content: ...
  }
}
```

- options are
  - values: 
    - false: do not include value
    - true: (default) include complete value
  - meta:
    - false: (default) don't include meta data
    - true: include meta data in result

### `revisions.getLatestRevision(key, {allowAllAuthors}, cb)`

If key belongs to an original message, gets the latest revision of that object/document.
If instead key is the id of a revision, gets that specific revision.
Like `get()` it won't callback until the message was found, hoping it will
eventually show up.

```
{
  key: // key of the latest revision
  meta: {
    original: bool, // original or revision?
    old: bool,  // did it exist when we called or did we wait for it?
    forked: bool,
    incomplete: bool,
    change_requests: n
  },
  value: {
    content: ...
  }
}
```

- options are
  - allowAllAuthors:
    - true: include revisions by all authors
    - false: (default) ignore revisions by authors other than the original author

### `revisions.history(revisionRoot, {live, sync, keys, values})`

get the history of a document/an object and optionally get live updates whenever it changes

- options are
  - live: get live updates when a new revision is published
  - sync: emit `{sync: true}` to separate old records and live data
  - keys: include keys in output (default: true)
  - values: 
    - false: do not include values
    - `undefined`: (default) include stripped-down values (more efficient)
    - true: include complete values

> **NOTE** revisions are streamed unordered. To sort them, use ssb-sort.

### `revisions.heads(revisionRoot, {live, sync, keys, values, meta, maxHeads})`

stream current heads of an object, most current head first.

```
{
  meta: {
    heads: n,
    incomplete: bool,
  },
  heads: [{
    key: 
    value: 
  },
   ...
  ]
}
```

- options are
  - live: stream live changes
  - sync: emit `{sync: true}` to separate old records and live data
  - meta: include meta data (see below)
  - values: include values (default is false)
  - keys: include keys (default is true)
  - maxHeads: limit number of returned heads

> **NOTE** if there's just one key in the response object, the object collapses to that key's value.

Examples:

```
$ sbot revisions.heads "%kOMB4XM/5//b/fGtBcqIV3kbv5bERiTZWd4dkBWEQSs=.sha256" --meta
{
  "meta": {
    "heads": 2,
    "forked": true
  },
  "heads": [
    "%9ET2dmQhx9oAnVp1UxWycp1siCR2fwR1XRiw9f2eIrU=.sha256",
    "%fXSWgOSZJQaX+Ouur0N+INMOfmatw3MwOFQR3NsjYAo=.sha256"
  ]
}

$ sbot revisions.heads "%kOMB4XM/5//b/fGtBcqIV3kbv5bERiTZWd4dkBWEQSs=.sha256"   
[
  "%9ET2dmQhx9oAnVp1UxWycp1siCR2fwR1XRiw9f2eIrU=.sha256",
  "%fXSWgOSZJQaX+Ouur0N+INMOfmatw3MwOFQR3NsjYAo=.sha256"
]

$ sbot revisions.heads "%kOMB4XM/5//b/fGtBcqIV3kbv5bERiTZWd4dkBWEQSs=.sha256" -maxHeads 1
"%9ET2dmQhx9oAnVp1UxWycp1siCR2fwR1XRiw9f2eIrU=.sha256",

```

### `revisions.messagesByType(type, {live, sync, keys, values, seqs})`

Get a (live) stream of objects of a certain type.

> Because objects are mutable, their type may change. The stream will emit {type: 'del'} events if an object no longer is of the specified type.

```
{
  key: [type, revisionRoot],  // leveldb key
  seq:          // flumedb sequence
  value: {
    key:        // message key
    value: {    // message value
      author:
      content:
      ...
    }
  }
}
```

- options are
  - live: stream live changes
  - sync: emit `{sync: true}` to separate old records and live data
  - values: include message data (default is true)
  - keys: include leveldb keys (default is true)
  - seqs: include flumedb sequence numbers

### `revisions.messagesByBranch(branch, {live, sync, keys, values, seqs})`

Get a (live) stream of objects in a certain branch

> Because objects are mutable, their branch  may change. The stream will emit {type: 'del'} events if an object no longer is in the specifed branch.

```
{
  key: [branch, revisionRoot],  // leveldb key
  seq:          // flumedb sequence
  value: {
    key:        // message key
    value: {    // message value
      author:
      content:
      ...
    }
  }
}
```

- options are
  - live: stream live changes
  - sync: emit `{sync: true}` to separate old records and live data
  - values: include message data (default is true)
  - keys: include leveldb keys (default is true)
  - seqs: include flumedb sequence numbers


### `revisions.use(name, createView)`

Add a view (indexer) to ssb-revisions. These views are similar to flumeviews but can deal with mutable messages too. (I call them "ssb-review" instead of flumeview). There are two "review" implementations: [ssb-review-reduce](https://github.com/regular/ssb-review-reduce) (similar to flumeview-reduce) and [ssb-review-level](https://github.com/regular/ssb-review-level) (similar to flumeview-level).



