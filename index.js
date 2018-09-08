const pull = require('pull-stream')
const paramap = require('pull-paramap')
const many = require('pull-many')
const defer = require('pull-defer')
const createReduce = require('flumeview-reduce/inject')
const ssbsort = require('ssb-sort')
const ltgt = require('ltgt')
const multicb = require('multicb')

exports.name = 'revisions'
exports.version = require('./package.json').version
exports.manifest = {
  stats: 'source',
  history: 'source',
  heads: 'source',
  updates: 'source',
  originals: 'source',
  current: 'source'
}

const IDXVER=31

exports.init = function (ssb, config) {
  const Store = config.revisions && config.revisions.Store || require('flumeview-reduce/store/fs') // for testing
  
  const initialState = {
    stats: {
      forks: 0,
      incomplete: 0,
      revisions: 0
    }
  }

  const Reduce = createReduce(Store)(IDXVER, {
    initial: initialState,
    map: function(kv) {
      const seq = kv._seq
      delete kv._seq
      const timestamp = kv.value && kv.value.timestamp
      const c = kv.value && kv.value.content
      if (!isUpdate(kv)) return null

      const revisionRoot = c && c.revisionRoot
      const revisionBranch = (c && c.revisionBranch) || []

      return {
        seq,
        key: kv.key,
        timestamp,
        revisionRoot,
        revisionBranch: ary(revisionBranch)
      }
    },
    reduce: function (acc, {key, revisionRoot, revisionBranch, timestamp}, seq) {
      acc.stats.revisions++
      
      let a
      acc[revisionRoot] = (a = acc[revisionRoot] || {revisions: []})
      const was_incomplete = incomplete(a.revisions, revisionRoot)
      a.revisions.push({key, seq, revisionBranch, timestamp})
      const is_incomplete = incomplete(a.revisions, revisionRoot)

      const was_forked = a.heads && a.heads.length > 1
      a.heads = heads(revisionRoot, a.revisions)

      if (!was_incomplete && is_incomplete) acc.stats.incomplete++
      else if (was_incomplete && !is_incomplete) acc.stats.incomplete--

      if (!was_forked && a.heads.length > 1) acc.stats.forks++
      else if (was_forked && a.heads.length == 1) acc.stats.forks--
      
      return acc
    }
  })
  let log
  const s = ssb._flumeUse('revisions', (_log, name) => {
    log = _log
    const ret = Reduce(log, name)
    const _createSink = ret.createSink
    ret.createSink = function() {
      return pull(
        pull.through(x=>{
          console.log('indexing',
            JSON.stringify(x, null, 2)
          )
          x.value._seq = x.seq // expose seq to map function
        }),
        _createSink()
      )
    }
    return ret
  })


  s.history = function(revRoot, opts) {
    opts = opts || {}
    return pull(
      s.stream(opts),
      // the first item is the reduced state
      // all other items are the output of map
      mapFirst(
        acc => acc[revRoot] && acc[revRoot].revisions.map(toMsg(revRoot))
        ,
        v => v.revisionRoot == revRoot ? [toMsg(revRoot)(v)] : null
      ),
      pull.filter(),
      pull.flatten(),
      pull.asyncMap( (kv, cb) => {
        const key = kv.key
        if (opts.values == false) delete kv.value
        if (opts.keys == false) delete kv.key
        if (opts.values !== true) return cb(null, kv)
        ssb.get(key, (err, value) => {
          kv.value = value
          cb(err, kv)
        })
      }),
      stripSingleKey()
    )
  }

  s.heads = function(revRoot, opts) {
    opts = opts || {}
    let acc
    return pull(
      s.stream(opts),
      mapFirst(
        _acc => (
          acc = _acc, acc[revRoot]
        ),
        v => v.revisionRoot == revRoot ?
          //acc will already contain the new revision,
          //and the heads will also already be calculated!
          acc[revRoot]
          : null
      ),
      pull.filter(),
      pull.asyncMap( ({revisions, heads}, cb) => {
        const result = {}
        if (opts.meta) {
          const m = result.meta = {}
          if (heads.length > 1) m.forked = true
          if (incomplete(revisions, revRoot)) m.incomplete = true
        }
        result.heads = heads.map( key => ({key}) )
        if (!opts.values) return cb(null, result)
        pull(
          pull.values(result.heads),
          paramap( (h, cb) => ssb.get(h.key, (err, value) => {
            cb(err, h.value = value)
          })),
          pull.collect( err => cb(err, result) )
        )
      }),
      pull.asyncMap( (result, cb) => {
        pull(
          pull.values(result.heads),
          opts.maxHeads ? pull.take(opts.maxHeads) : pull.through(),
          pull.through( h => {
            if (opts.keys == false) delete h.key
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
      stripSingleKey()
    )
  }

  s.originals = function(opts) {
    opts = opts || {}
    return pull(
      log.stream(opts),
      pull.filter( kvv => {
        const kv = kvv && kvv.value
        if (!kv) return true
        return !isUpdate(kv)
      })
    )
  }

  // stream heads of all revroots that have changed since opts.gt
  s.updates = function(opts) {
    opts = opts || {}
    if (Object.keys(opts).find(x => x!=='gt' && x!=='old_values')) return pull.error(new Error('invalid option'))
    const since = opts.gt

    let acc
    return pull(
      s.stream(),
      mapFirst(
        _acc => (acc = _acc, Object.keys(acc).filter(k=>k!=='stats').map(k=>Object.assign({}, acc[k], {revisionRoot: k})) ),
        v => v ?
          //acc will already contain the new revision,
          //and the heads will also already be calculated!
          [Object.assign({}, acc[v.revisionRoot], {revisionRoot: v.revisionRoot})]
          : []
      ),
      pull.flatten(),

      // calculate head that was current at sequence=since
      (since ?  pull(
        pull.through(e => {
          e.oldHeads = heads(e.revisionRoot, e.revisions, {lte: since})
        }),
        //pull.through(console.log),
        // is there a new head compared to last time?
        pull.filter( ({heads, oldHeads}) => heads[0] !== oldHeads[0] )
      ) : pull.through() ),
      pull.map(({heads, oldHeads, revisions}) => {
        // key => seq
        return {
          cur: heads.map(k => revisions.find(r=>r.key == k).seq ),
          old: oldHeads ? oldHeads.map(k => revisions.find(r=>r.key == k).seq ) : null
        }
      }),
      pull.asyncMap( ({cur, old}, cb) => {
        const mcb = multicb({pluck: 1})
        log.get(cur[0], mcb())
        if (opts.old_values && old && old[0]) {
          log.get(old[0], mcb())
        }
        mcb( (err, result) => {
          if (err) return cb(err)
          const ret = {
            value: result[0],
            seq: cur[0],
            forked: cur.length > 1,
            old_seq: old && old[0]
          }
          if (result.length>1) {
            ret.old_value=result[1]
          }
          cb(null, ret)
        })
      })
    )
  }

  s.current = function(opts) {
    opts = opts || {}
    const ret = defer.source()
    pull(s.stream(), pull.take(1), pull.collect( (err, _acc) => {
      if (err) return ret.resolve(pull.error(err))
      const acc = _acc[0]
      ret.resolve(
        many([
          s.updates(opts),
          pull(
            s.originals(opts),
            // filter out outdated originals
            pull.filter( kkv => !acc[kkv.value.key] )
          )
        ])
      ) 
    }))
    return ret
  }

  s.stats = function(opts) {
    opts = opts || {}
    let acc
    return pull(
      s.stream(opts),
      mapFirst(
        _acc => (acc = _acc, acc.stats),
        v => acc.stats
      ),
      filterRepeated( x => JSON.stringify(x) )
    )
  }
  return s
}

// utils ///////

function stripSingleKey() {
  return pull.map( kv => {
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

function mapFirst(m1, m2) {
  let first = true
  return pull.map( function(x) {
    const result = first ? m1(x) : m2(x)
    first = false
    return result
  })
}

function ary(x) {
  return Array.isArray(x) ? x : [x]
}

function incomplete(msgs, revRoot) {
  // NOTE: we assume that revisionRoot is present
  // (this limits the actual value of this function)
  const revs = msgs.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {[revRoot]: true})
  for(let m of msgs) {
    for(let b of m.revisionBranch) {
      if (!revs[b]) return true
    }
  }
  return false
}

function heads(revisionRoot, revisions, opts) {
  opts = opts || {}
  const f=ltgt.filter(opts)
  const msgs = revisions
    .filter( r => f(r.seq) )
    .map(toMsg(revisionRoot))
  const hds = ssbsort.heads(msgs)
  const revs = msgs.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {})
  return hds.map( k => revs[k] ).sort(compare).map( kv => kv.key )
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
