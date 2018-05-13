Use Cases

- display the history of a message/an object and get live updates when it changes

`revisions.history(revRoot) -> ssb-sort`


- observe the current heads of all object/a particular object

`revisions.heads({revRoot})`
 
- edit a message in your favourite $EDITOR

`revisions.edit(revRoot-or-revBrabh)`

- update message content from stdin

`revisions.update(revRoot-or-revBrabh)`

- git diff, but for revisions

maybe not, the impl would have nothing to do with revs, just comparing two msgs. Should be a sh scripy instead.
