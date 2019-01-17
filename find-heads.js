const ssbsort = require('ssb-sort')
const debug = require('debug')('ssb-revisions:find-heads')

module.exports = function heads(revisionRoot, revisions, opts) {
  opts = opts || {}
  const {allowAllAuthors, meta} = opts
  let strippedRevs = revisions.map( kv => {
    const {revisionRoot, revisionBranch} = kv.value.content
    return {
      key: kv.key,
      value: {
        author: kv.value.author,
        timestamp: kv.value.timestamp,
        content: {
          revisionRoot,
          revisionBranch
        }
      }
    }
  })

  const revs = revisions.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {})
  let hds = ssbsort.heads(strippedRevs)
  let change_requests = 0

  if (!allowAllAuthors) {
    // do we know the original message?
    const roots = ssbsort.roots(strippedRevs)
    if (roots.length !== 1 || !isOriginal(revs[roots[0]])) {
      debug('No original message found for %s (%d roots)', revisionRoot, roots.length)
      if (!meta) return []
      return {
        heads: [],
        meta: {
          change_requests: 0,
          incomplete: true
        }
      }
    }
    const {author} = revs[roots[0]].value
    const ret = removeForeign(hds, revs, strippedRevs, author, 0)
    change_requests = ret.change_requests
    hds = ret.hds
  }

  hds = hds.map( k => revs[k] ).sort(compare)
  if (!meta) return hds
  return {
    heads: hds,
    meta: {
      change_requests,
      incomplete: incomplete(revisions, revisionRoot)
    }
  }
}

function isOriginal(kv) {
  const content = kv && kv.value && kv.value.content
  if (!content) return false
  if (content.revisionRoot && content.revisionRoot !== kv.key) return false
  if (content.revisionBranch && content.revisionBranch !== kv.key) return false
  return true
}

function compare(a, b) {
  return (
    //declared timestamp, may by incorrect or a lie
    (b.value.timestamp - a.value.timestamp) ||
    //finially, sort hashes lexiegraphically.
    (a.key > b.key ? -1 : a.key < b.key ? 1 : 0)
  )
}


function removeForeign(hds, revs, strippedRevs, author, change_requests) {
  let dirty = false
  hds.forEach(head => {
    if(revs[head].value.author !== author) {
      change_requests++
      dirty = true
      strippedRevs = strippedRevs.filter(kv => kv.key !== head)
    }
  })
  if (!dirty) return {change_requests, hds}
  hds = ssbsort.heads(strippedRevs)
  return removeForeign(hds, revs, strippedRevs, author, change_requests)
}

function incomplete(msgs, revRoot) {
  const revs = msgs.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {})
  for(let m of msgs) {
    for(let b of ary(m.value.content.revisionBranch)) {
      if (!revs[b]) return true
    }
  }
  return false
}


function ary(x) {
  if (x==undefined || x==null) return []
  return Array.isArray(x) ? x : [x]
}
