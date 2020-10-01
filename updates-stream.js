const pull = require('pull-stream')
const defer = require('pull-defer')
const next = require('pull-next')
const debug = require('debug')('ssb-revisions:updates-stream')

const PastAndPresentHeads = require('./reduce/past-and-present-heads')

module.exports = function(read, since, streamHeads) {
  const pastAndPresentHeads = PastAndPresentHeads(streamHeads)

  return function streamUpdates(opts) {
    opts = opts || {}
    const oldSeq = opts.since !== undefined ? opts.since : -1
    const limit = opts.limit || 512 // TODO
    const {validator, allowAllAuthors} = opts
    let newSeq = -1
    let i = 0
    return next( ()=> { switch(i++) {
      case 0: 
        //console.log('api.read', oldSeq, '-', api.since.value)
        if (oldSeq == since.value) {
          newSeq = oldSeq
          return pull.empty()
        }
        const deferred = defer.source()
        // what revRoots where changed?
        pull(
          read({
            gt: ['SR', oldSeq, undefined],
            lte: ['SR', since.value, undefined],
            values: false,
            keys: true,
            seqs: false
          }),
          pull.through( ([_, seq, __]) => {
            newSeq = Math.max(newSeq, seq)
          }),
          pull.map(([_, __, revRoot]) => revRoot),
          pull.unique(),
          pull.take(limit),
          pull.collect( (err, revRoots) => {
            if (err) return deferred.resolve(pull.error(err))
            if (newSeq == -1 || newSeq == oldSeq) {
              // we have not seen any revisions
              //console.log('empty set, oldSeq=', oldSeq)
              newSeq = oldSeq
              return deferred.resolve(pull.empty())
            }
            debug('processing updates from %d to %d', oldSeq, newSeq)
            deferred.resolve(
              pastAndPresentHeads(revRoots, oldSeq, newSeq, {validator, allowAllAuthors})
            )
          })
        )
        return deferred
      case 1: return pull.once({since: newSeq})
    }})
  }
}
