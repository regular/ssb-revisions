const pull = require('pull-stream')
const createReduce = require('flumeview-reduce/inject')
const ssbsort = require('ssb-sort')

exports.name = 'revisions'
exports.version = require('./package.json').version
exports.manifest = {
  history: 'source',
  heads: 'source'
}

exports.init = function (ssb, config) {
  const Store = config.revisions && config.revisions.Store || require('flumeview-reduce/store/fs') // for testing
  const s = ssb._flumeUse('revisions', createReduce(Store)(16, {
    initial: {},
    map: function(kv) {
      const timestamp = kv.value && kv.value.timestamp
      const c = kv.value && kv.value.content
      const revisionRoot = c && c.revisionRoot
      const revisionBranch = (c && c.revisionBranch) || []
      if (!revisionRoot) return null
      return {
        key: kv.key,
        timestamp,
        revisionRoot,
        revisionBranch: ary(revisionBranch)
      }
    },
    reduce: function (acc, {key, revisionRoot, revisionBranch, timestamp}, seq) {
      let a
      acc[revisionRoot] = (a = acc[revisionRoot] || {revisions: []})
      a.revisions.push({key, revisionBranch, timestamp})
      a.heads = heads(a.revisions.map(toMsg(revisionRoot)))
      return acc
    }
  }))

  s.history = function(revRoot, opts) {
    opts = opts || {}
    return pull(
      s.stream(opts),
      // the first item is the recuced state
      // all other items are the output of map
      mapFirst(
        acc => acc[revRoot] && acc[revRoot].revisions.map(toMsg(revRoot))
        ,
        v => v.revisionRoot == revRoot ? [toMsg(revRoot)(v)] : null
      ),
      pull.filter(),
      pull.flatten()
    )
  }

  s.heads = function(revRoot, opts) {
    opts = opts || {}
    let acc
    return pull(
      s.stream(opts),
      mapFirst(
        _acc => (
          acc = _acc, (acc[revRoot] && acc[revRoot].heads)
        ),
        v => v.revisionRoot == revRoot ?
          //acc will already contain the new revision,
          //and the heads will also already be calculated!
          acc[revRoot].heads
          : null
      ),
      pull.filter()
    )
  }
  return s
}

// utils ///////

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

