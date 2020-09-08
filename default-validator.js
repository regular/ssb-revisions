const ssbsort = require('ssb-sort')
const debug = require('debug')('default-validator')

module.exports = function DefaultValidator(allowAllAuthors) {
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

