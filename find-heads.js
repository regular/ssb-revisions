const ssbsort = require('ssb-sort')
const debug = require('debug')('ssb-revisions:find-heads')

module.exports = function getHeads(revisionRoot, revisions, opts) {
  opts = opts || {}
  const {meta} = opts
  const validator = opts.validator || DefaultValidator(opts.allowAllAuthors)

  const strippedRevs = getStruppedRevs(revisions)
  const msgMap = revisions.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {})

  function getOriginal() {
    const roots = ssbsort.roots(strippedRevs)
    if (roots.length !== 1 || !isOriginal(msgMap[roots[0]])) {
      return null
    } else {
      return msgMap[roots[0]]
    }
  }

  return validator(revisionRoot, msgMap, {
    getOriginal,
    isIncomplete: msgs => incomplete(msgs, revisionRoot),
    getStripped: ()=> strippedRevs,
    ssbsort,
    compare
  }, {meta: opts.meta})
}

function DefaultValidator(allowAllAuthors) {
  return function(revisionRoot, msgMap, {
    getOriginal,
    getStripped,
    ssbSort,
    isIncomplete,
    compare
  }, opts) {
    opts = opts || {}
    const {meta} = opts

    let hds = ssbsort.heads(getStripped())
    let change_requests = 0

    if (!allowAllAuthors) {
      // remove all heads that are not by the original author
      const original = getOriginal()
      if (!original) {
        debug('No original message found for %s', revisionRoot)
        if (!meta) return []
        return {
          heads: [],
          meta: {
            change_requests: 0,
            incomplete: true
          }
        }
      }
      const {author} = original.value
      const ret = removeForeign(hds, msgMap, getStripped(), author, 0)
      change_requests = ret.change_requests
      hds = ret.hds
    }

    hds = hds.map( k => msgMap[k] ).sort(compare)
    if (!meta) return hds
    return {
      heads: hds,
      meta: {
        change_requests,
        incomplete: isIncomplete(Object.values(msgMap))
      }
    }
  }
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

function getStruppedRevs(revisions) {
  return revisions.map( kv => {
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
