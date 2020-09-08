module.exports = function isIncomplete(msgMap) {
  for(let m of Object.values(msgMap)) {
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
