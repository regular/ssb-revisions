const pull = require('pull-stream')
const paramap = require('pull-paramap')
const createReduce = require('flumeview-reduce/inject')
const ssbsort = require('ssb-sort')
const ltgt = require('ltgt')

exports.name = 'revisions'
exports.version = require('./package.json').version
exports.manifest = {
  stats: 'source',
  history: 'source',
  heads: 'source',
  current: 'source'
}

const IDXVER=28

exports.init = function (ssb, config) {
  const Store = config.revisions && config.revisions.Store || require('flumeview-reduce/store/fs') // for testing
  
  const Reduce = createReduce(Store)(IDXVER, {
    initial: {
      stats: {
        forks: 0,
        incomplete: 0,
        revisions: 0
      }
    },
    map: function(kv) {
      const seq = kv._seq
      const timestamp = kv.value && kv.value.timestamp
      const c = kv.value && kv.value.content
      const revisionRoot = c && c.revisionRoot
      const revisionBranch = (c && c.revisionBranch) || []
      if (!revisionRoot || !revisionBranch) return null
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
      a.heads = heads(a.revisions.map(toMsg(revisionRoot)))

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

  // stream current heads of all revroots
  s.current = function(opts) {
    opts = opts || {}
    const filter = ltgt.filter(opts)
    let acc
    return pull(
      s.stream(opts),
      mapFirst(
        _acc => (acc = _acc, Object.keys(acc).filter(k=>k!=='stats').map(k=>acc[k])  ),
        v => v ?
          //acc will already contain the new revision,
          //and the heads will also already be calculated!
          [acc[v.revisionRoot]]
          : []
      ),
      pull.flatten(),
      pull.map(({heads, revisions}) => {
        return heads.map(k => revisions.find(r=>r.key == k).seq )
      }),
      pull.filter( heads => filter(heads[0]) ),
      pull.through(console.log),
      pull.asyncMap( (heads, cb) => {
        log.get(heads[0], (err, value) => {
          if (err) return cb(err)
          cb(null, {
            value,
            seq: heads[0],
            forked: heads.length > 1
          })
        })
      })
    )
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

function heads(msgs) {
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

