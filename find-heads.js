const ssbsort = require('ssb-sort')
const debug = require('debug')('ssb-revisions:find-heads')
const DefaultValidator = require('./default-validator')

module.exports = function getHeads(revisionRoot, revisions, opts, cb) {
  if (typeof opts == 'function') {
    cb = opts
    opts = {}
  }
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

  validator(revisionRoot, msgMap, {
    getOriginal,
    isIncomplete: msgs => incomplete(msgs, revisionRoot),
    getStripped: ()=> strippedRevs,
    compare
  }, {meta: opts.meta}, cb)
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
