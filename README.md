## API

- get statistics

`revisions.stats({live})`

- format is

{
  forks: n,       // number of objects with mutliple heads
  incomplete: n,  // number of objects with missing revisions
  revisions: n    // total number of revisions
}

- get the history of a message/an object and optionally get live updates whenever it changes

`revisions.history(revisionRoot, {live}) -> ssb-sort`

**NOTE** revisions are streamed unordered. To sort them, use ssb-sort.

- get or observe the current heads of an object, most current head first.

`revisions.heads(revisionRoot, {live, keys, values, meta})
 
- format is

{
  heads: [{
    key: revision,
    value: optional message velaue
  },
   ...
  ]
}

- get current head only (get latest reviion of a given object)

`revisions.head([revRoot], {live, values})

- options
  - live: stream live changes
  - meta: include meta data (see below)
  - values: include values
  - keys: include keys (default: true) 

- format is

{
  meta: {
    forked: bool, // true, if ther is more than one head
    incomplete: bool, // true, if revisions are missing
    change_request: bool // true, if a later, untrusted head exists
  },
  head: {
    key: revision,
    value: optional message velaue
  }
}

- edit a message in your favourite $EDITOR

`revisions.edit(revRoot-or-revBrabh)`

- update message content from stdin

`revisions.update(revRoot-or-revBrabh)`

- git diff, but for revisions

maybe not, the impl would have nothing to do with revs, just comparing two msgs. Should be a sh scripy instead.
