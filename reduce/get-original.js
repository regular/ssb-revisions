const strip = require('./strip')
const isOriginal = require('./is-original')
const ssbsort = require('ssb-sort')
const map = require('./msg-map')

module.exports = function getOriginal(revisions) {
  const msgMap = map(revisions)
  const roots = ssbsort.roots(strip(revisions))
  if (roots.length !== 1 || !isOriginal(msgMap[roots[0]])) {
    return null
  } else {
    return msgMap[roots[0]]
  }
}
