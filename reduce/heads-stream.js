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
    const state = {}
    const  meta = opts.meta ? (state.meta = {}) : false

    if (live) {
      return pull(
        source(),
        liveStream(),
        format()
      ) 
    } else {
      return pull(
        pull.once(1),
        pull.asyncMap( (_, cb) =>{
          pull(
            source(),
            pull.drain(rev=>revisions.push(rev), err =>{
              if (err) return cb(err)
              if (revisions.length == 0) return cb(null, null)
              getHeads(cb)
            })
          )
        }),
        pull.filter(),
        format()
      )
    }

    function source() {
      return historyStream(revRoot, Object.assign({}, opts, {
        values: true,
        keys: true,
        live: live,
        sync: live // always emit sync in live mode
      }))
    }

    function getHeads(cb) {
      findHeads(revRoot, revisions, {allowAllAuthors, validator, meta: opts.meta}, (err, result) => {
        if (err) return cb(err)
        if (!meta) {
          state.heads = result
        } else {
          state.heads = result.heads
          meta.forked = state.heads.length > 1
          meta.incomplete = result.meta.incomplete
          meta.change_requests = result.meta.change_requests
        }
        cb(null, state)
      }) 
    }

    function liveStream() {
      let synced = false
      return pull(
        pull.asyncMap( (kv, cb) => {
          if (kv.sync) {
            synced = true
            getHeads( err=>{
              if (err) return cb(err)
              cb(null, opts.sync ? [state, kv] : [state])
            })
            return
          } else {
            revisions.push(kv)
          }
          if (!synced) return cb(null, null)
          getHeads(err=>{
            if (err) return cb(err)
            cb(null, [state])
          })
        }),
        pull.filter(),
        pull.flatten()
      )
    }

    function format() {
      return pull(
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
    }
  }
}
