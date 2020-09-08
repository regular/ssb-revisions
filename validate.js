const pull = require('pull-stream')
const multicb = require('multicb')
const debug = require('debug')('ssb-revisions:validate')

module.exports = function validatedPastAndPresentValues(api, revRoots, oldSeq, newSeq, validator) {
  return pull(
    pull.values(revRoots),
    pull.asyncMap( (revRoot, cb) => {
      const done = multicb({pluck: 1})
      // TODO: getValueAt takes edits by all authors into account
      // this needs to be changed to support change requests
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

function getValueAt(api, revRoot, at, validator, cb) {
  pull(
    api.heads(revRoot, {
      lte: at,
      keys: true,
      values: true,
      seqs: true,
      meta: true,
      maxHeads: 1,
      validator,
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
