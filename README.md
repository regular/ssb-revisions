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

`revisions.history(revisionRoot, {live, keys, values})

- options are
  - live: get live updates when a new revision is published
  - keys: include keys in output (default: true)
  - values: 
    - false: do not include values
    - `undefined`: (default) include stripped-down values (more efficient)
    - true: include complete values

**NOTE** revisions are streamed unordered. To sort them, use ssb-sort.

- stream current heads of an object, most current head first.

`revisions.heads(revisionRoot, {live, keys, values, meta, maxHeads})
 
- format is

{
  meta: {
 TODO:   heads: n,
    incomplete: bool,
 TODO:   change_requests: n,
  },
  heads: [{
    key: 
    value: 
  },
   ...
  ]
}

- options
  - live: stream live changes
  - meta: include meta data (see below)
  - values: include values (default is false)
  - keys: include keys (default is true) 

**NOTE** if there's just one key in an object, the object collapses that key's value.

Example:

```
$ sbot revisions.heads "%kOMB4XM/5//b/fGtBcqIV3kbv5bERiTZWd4dkBWEQSs=.sha256" --m eta
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

```

- TODO: edit a message in your favourite $EDITOR

`revisions.edit(revRoot-or-revBrabh)`

- TODO: update message content from stdin

`revisions.update(revRoot-or-revBrabh)`
