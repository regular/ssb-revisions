const pull = require('pull-stream')
const defer = require('pull-defer')
const debug = require('debug')('ssb-revisions:heads-stream')

const findHeads = require('./find-heads')
const {stripSingleKey, filterRepeated} = require('../lib/stream-formatting.js')

module.exports = function(historyStream) {
  return function headsStream(revRoot, opts) {
    opts = opts || {}
    const {live, sync, allowAllAuthors, validator} = opts
    const revisions = []
    let synced = false
    const state = {}
    let meta
    if (opts.meta) {
      meta = state.meta = {}
    }
    const stream = pull(
      historyStream(revRoot, Object.assign(
        {}, opts, {
          values: true,
          keys: true,
          sync: live
        }
      )),
      pull.asyncMap( (kv, cb) => {
        if (kv.sync) {
          synced = true
          return cb(null, sync ? [state, kv] : [state])
        }
        revisions.push(kv)
        // TODO: when called from getMessageAt() (validate.js)
        // findHeads is called for every intermediate state,
        // not just the last state, which is a waste!
        findHeads(revRoot, revisions, {allowAllAuthors, validator, meta}, (err, result) => {
          if (err) return cb(err)
          if (!meta) {
            state.heads = result
          } else {
            state.heads = result.heads
            meta.forked = state.heads.length > 1
            meta.incomplete = result.meta.incomplete
            meta.change_requests = result.meta.change_requests
          }
          cb(null, !live || (live && synced) ? [state] : null)
        }) 
      }),
      pull.filter(),
      pull.flatten(),
      pull.asyncMap( (result, cb) =>{
        pull(
          pull.values(result.heads),
          opts.maxHeads ? pull.take(opts.maxHeads) : pull.through(),
          pull.through( h => {
            if (opts.keys == false) delete h.key
            if (opts.values == false) delete h.value
          }),
          stripSingleKey(),
          pull.collect( (err, heads) => {
            if (opts.keys == false && opts.values == false) {
              delete result.heads
            } else {
              result.heads = heads
            }
            cb(err, result)
          })
        )
      }),
      stripSingleKey(),
      filterRepeated( JSON.stringify )
    )
    if (live) return stream
    const deferred = defer.source()
    let lastState
    pull(
      stream,
      pull.drain( result => { lastState = result }, err => {
        if (err) return deferred.resolve(pull.error(err))
        deferred.resolve(pull.once(lastState))
      })
    )
    return deferred
  }
}
