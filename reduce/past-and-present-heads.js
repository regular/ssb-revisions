const pull = require('pull-stream')
const multicb = require('multicb')
const debug = require('debug')('ssb-revisions:past-and-present-heads')

module.exports = function pastAndPresentHeads(api, revRoots, oldSeq, newSeq, validator) {
  debug('processing %d revRoots. old seq: %d, new seq: %d', revRoots.length, oldSeq, newSeq)

  return pull(
    pull.values(revRoots),
    pull.asyncMap( (revRoot, cb) => {
      const done = multicb({pluck: 1})
      getValueAt(api, revRoot, oldSeq, validator, done())
      getValueAt(api, revRoot, newSeq, validator, done())

      done( (err, values) => {
        if (err) return cb(err)
        cb(null, {
          key: revRoot,
          old_value: values[0],
          value: values[1]
        })
      })
    })
  )
}

function getValueAt(api, revRoot, seq, validator, cb) {
  debug('getValue for %s at seq %d', revRoot, seq)
  if (seq == -1) return cb(null, null)
  pull(
    api.heads(revRoot, {
      lte: seq,
      keys: true,
      values: true,
      seqs: true,
      meta: true,
      maxHeads: 1,
      validator,
      // TODO: here's why formerly
      // views took all revisions into account
      // (no validation)
      allowAllAuthors: true
    }),
    pull.collect((err, items) => {
      if (err) return cb(err)
      if (!items.length) return cb(null, null)
      const head = items[0].heads[0]
      cb(null, {
        key: head.key, 
        value: head.value, 
        seq: head.seq, 
        meta: items[0].meta,
      })
    })
  )
}
