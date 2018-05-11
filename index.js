const pull = require('pull-stream')
const ViewLevel = require('flumeview-level')

// TODO: can we use original, now that we do not support drafts here?
const ssbsort = require('./ssb-sort')(links, breakTie)

// taken from ssb-cms/update-stream.js

function links(value, each) {
  if (!value) return
  const links = (value.content && value.content.revisionBranch) || []
  links.forEach(each)
}

function breakTie(a, b) {
  return (
    //declared timestamp, may by incorrect or a lie
    (b.value.timestamp - a.value.timestamp) ||
    //finially, sort hashes lexiegraphically.
    (a.key > b.key ? -1 : a.key < b.key ? 1 : 0)
  )
}

function getHeads(revisions, isTrustedKey) {
  isTrustedKey = isTrustedKey || (() => true)
  let heads = ssbsort.heads(revisions)

  const revs = {}
  revisions.forEach( kv => revs[kv.key] = kv )

  function trusted(kv) {
    let newestTrusted 
    function recurse(key) {
      let kv = revs[key]
      if (!kv) return
      
      // too old
      if (
        newestTrusted &&
        newestTrusted.value.timestamp > kv.value.timestamp
      ) {
        return
      }
      
      // not trusted
      if (
        !isTrustedKey(kv.value.author)
      ) {
        return links(kv.value, recurse)
      }
      
      newestTrusted = kv
    }

    if (
      isTrustedKey(kv.value.author)
    ) {
      return kv
    }
    links(kv.value, recurse)
    //console.log('trusted',kv,newestTrusted)
    return newestTrusted
  }

  // sort trusted heads, newest first
  return heads.map(k => trusted(revs[k])).filter( x=>x ).sort(breakTie)
}

function headFingerprint(heads) {
  console.log('heads', heads)
  return heads.map( kv => kv.key ).join('-')
}

exports.name = 'revisions'
exports.version = require('./package.json').version
exports.manifest = {
  history: 'source',
  heads: 'source'
}

function parseIndex({key}) {
  const l = key.split('%').slice(1) // starts with delimiter
  const revisionRoot = '%' + l.splice(0, 1)[0]
  const timestamp = Number(l.pop())
  const msgId = '%' + l.pop()
  const revisionBranch = l.map( x => `%${x}` )
  return {
    key: msgId,
    value: {
      timestamp,
      content: {
        revisionRoot,
        revisionBranch
      }
    }
  }
}

exports.init = function (ssb, config) {
  const s = ssb._flumeUse('revisions', ViewLevel(8, kv => {
    //console.log(JSON.stringify(kv, null, 2))
    const revRoot = (kv.value && kv.value.content && kv.value.content.revisionRoot)
    if (!revRoot || revRoot == kv.key) return []
    let revBranch = (kv.value && kv.value.content && kv.value.content.revisionBranch) || []
    if (!Array.isArray(revBranch)) revBranch = [revBranch]
    const ret = [revRoot].concat(revBranch).concat([kv.key, '%' + kv.value.timestamp]).join('')
    console.log(ret)
    return [ret]
  }))

  function getAllRevs(key, cb) {
    pull(
      s.read({
        keys: true,
        values: false,
        gte: key,
        lt: key + String.fromCharCode('%'.charCodeAt(0)+1)
      }),
      pull.map(parseIndex),
      pull.collect(cb)
    )
  }

  s.history = function(key, opts) {
    opts = opts || {}
    return pull(
      s.read({
        keys: true,
        values: false,
        live: opts.live,
        sync: opts.sync,
        gte: key,
        lt: key + String.fromCharCode('%'.charCodeAt(0)+1)
      }),
      pull.map(kv => {
        console.log(kv)
        // TODO: we do not get sync from flumeview.read()?
        return kv.key ? parseIndex(kv) : {sync: true}
      })
    )
  }

  s.heads = function(key) {
    let synced = false
    return pull(
      s.read(Object.assign({
        keys: true,
        values: false,
        live: true
      }, key ? {
        gte: key,
        lt: key + String.fromCharCode('%'.charCodeAt(0)+1)
      } : {})),
      pull.map(kv => {
        // TODO: we do not get sync from flumeview.read()?
        return kv.key ? parseIndex(kv) : {sync: true}
      }),
      pull.filter( kv => {
        return !kv.sync
      }),
      pull.through( kv => {
        console.log(kv)
      }),
      pull.asyncMap( (kv, cb) => {
        getAllRevs(kv.value.content.revisionRoot, (err, revs) => {
          if (err) return cb(err)
          cb(null, getHeads(revs))
        })
      }),
      (function() {
        let last
        return pull.filter( heads => {
          const fp = headFingerprint(heads)
          if (last === fp) return false
          last = fp
          return true
        })
      })()
    )
  }
  return s
}

