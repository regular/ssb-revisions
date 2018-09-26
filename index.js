const pull = require('pull-stream')
const paramap = require('pull-paramap')
const merge = require('pull-merge')
const defer = require('pull-defer')
const next = require('pull-next')
const createView = require('flumeview-level')
const ssbsort = require('ssb-sort')
const ltgt = require('ltgt')
const multicb = require('multicb')

const getRange = require('./get_range')

exports.name = 'revisions'
exports.version = require('./package.json').version
exports.manifest = {
  history: 'source',
  heads: 'source',
  current: 'source'
}

const IDXVER=2

exports.init = function (ssb, config) {
  
  const view = createView(IDXVER, (kv, seq) => {
    const c = kv.value && kv.value.content
    const revisionRoot = c && c.revisionRoot || kv.key
    console.log('MAP', seq, revisionRoot)
    return [[revisionRoot, seq]]
  })

  const sv = ssb._flumeUse('revisions', view)

  sv.history = function(revRoot, opts) {
    opts = opts || {}
    // lt gt in opts are seqs
    const o = Object.assign(
      getRange([revRoot], opts), {
        values: true,
        keys: false,
        seqs: false,
        live: opts.live,
        sync: opts.sync
      }
    )
    console.log(o)
    return pull(
      sv.read(o),
      pull.through(kv => {
        if (opts.keys == false) delete kv.key
        if (opts.values == false) delete kv.value
      }),
      stripSingleKey()
    )
  }

  sv.heads = function(revRoot, opts) {
    opts = opts || {}
    const {live, sync} = opts
    const revisions = []
    let synced = false
    const state = {}
    let meta
    if (opts.meta) {
      meta = state.meta = {}
    }
    const stream = pull(
      sv.history(revRoot, Object.assign(
        {}, opts, {
          values: true,
          keys: true,
          sync: live
        }
      )),
      pull.map( kv => {
        if (kv.sync) {
          synced = true
          return sync ? [state, kv] : [state]
        }
        revisions.push(kv)
        state.heads = heads(revRoot, revisions) 
        if (meta && state.heads.length > 1) meta.forked = true
        if (meta && incomplete(revisions, revRoot)) meta.incomplete = true
        return !live || (live && synced) ? [state] : null
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
      pull.drain( result => { lastState = result}, err => {
        if (err) return deferred.resolve(pull.error(err))
        deferred.resolve(pull.once(lastState))
      })
    )
    return deferred
  }

  // TODO: return revisions onstead of wrapped view
  //s.use = require('./indexing')(log, ssb.ready, s.current)
  //s.use('byBranch', require('./indexes/branch') )

  return sv
}

// utils ///////

function stripSingleKey() {
  return pull.map( kv => {
    if (kv.sync) return kv
    if (Object.keys(kv).length == 1) {
      for(let k in kv) return kv[k]
    }
    return kv
  })
}

function filterRepeated(f) {
  let last
  return pull.filter( x => {
    const y = f(x)
    const ret = last != y
    last = y
    return ret
  })
}

function ary(x) {
  if (x==undefined || x==null) return []
  return Array.isArray(x) ? x : [x]
}

function incomplete(msgs, revRoot) {
  console.log(msgs)
  const revs = msgs.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {})
  for(let m of msgs) {
    for(let b of ary(m.value.content.revisionBranch)) {
      if (!revs[b]) return true
    }
  }
  return false
}

function heads(revisionRoot, revisions) {
  const hds = ssbsort.heads(revisions)
  const revs = revisions.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {})
  return hds.map( k => revs[k] ).sort(compare)
}

function compare(a, b) {
  return (
    //declared timestamp, may by incorrect or a lie
    (b.value.timestamp - a.value.timestamp) ||
    //finially, sort hashes lexiegraphically.
    (a.key > b.key ? -1 : a.key < b.key ? 1 : 0)
  )
}

function toMsg(revisionRoot) {
  return function(r) {
    const {key, revisionBranch, timestamp} = r
    return {
      key,
      value: {
        timestamp,
        content: {revisionRoot, revisionBranch}
      }
    }
  }
}

function isUpdate(kv) {
  const content = kv.value && kv.value.content
  if (!content) return false
  const revRoot = content.revisionRoot
  const revBranch = content.revisionBranch
  if (!revRoot || !revBranch) return false
  if (revRoot == kv.key) return false
  return true
}
