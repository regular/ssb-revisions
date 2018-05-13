What we eventually want, is a per-revRoot index of all revisions and, in particular, the heads.
This is a reduce, but for a group of messages (the ones with the same revRoot)

One way we could achieve this:

Implement a flumeview-reduce that maintains its own leveldb with one record per revRoot.
The record contains the list of revisions and the heads, and/or roots, other meta-data

Since reduce needs to be a sync function, it will have to maintain a write-queue to write to leveldb asynchronously: It builds up batch writes until a previous write succeeds. (use async-single)

This way, clients can ask for specifically the heads of the revRoot(s) they are interested in, instead of having to get the entire reduce-view on application start.
