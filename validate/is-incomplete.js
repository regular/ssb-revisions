const map = require('./msg-map')

module.exports = function isIncomplete(revisions) {
  const msgMap = map(revisions)
  for(let m of revisions) {
    for(let b of ary(m.value.content.revisionBranch)) {
      if (!msgMap[b]) return true
    }
  }
  return false
}

function ary(x) {
  if (x==undefined || x==null) return []
  return Array.isArray(x) ? x : [x]
}
