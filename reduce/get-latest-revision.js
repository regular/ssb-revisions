const pull = require('pull-stream')

module.exports = function(get, headsStream) {
  // key may be original or revision
  // returns kv
  return function getLatestRevision(key, opts, cb) {
    if (typeof opts == 'function') {
      cb = opts
      opts = {}
    }
    get(key, {meta: true, values: true}, (err, kv) => {
      if (err) return cb(err)
      kv.key = key
      if (!kv.meta.original) {
        // it's a revision
        return cb(null, kv)
      }
      pull(
        headsStream(key, {
          keys: true,
          values: true,
          //seqs: true,
          validator: opts.validator,
          allowAllAuthors: opts.allowAllAuthors,
          meta: true,
          maxHeads: 1
        }),
        pull.collect((err, items) => {
          if (err) return cb(err)
          if (!items.length) return cb(new Error(`key not found: ${key}`))
          const head = items[0].heads[0]
          cb(null, {
            key: head.key, 
            value: head.value, 
            //seq: head.seq, 
            meta: Object.assign(
              kv.meta, {
                original: head.key == key,
              }, items[0].meta
            )
          })
        })
      )
    })
  }
}
