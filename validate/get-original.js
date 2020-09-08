const strip = require('./strip')
const isOriginal = require('./is-original')
const ssbsort = require('ssb-sort')

module.exports = function getOriginal(msgMap) {
  const roots = ssbsort.roots(strip(msgMap))
  if (roots.length !== 1 || !isOriginal(msgMap[roots[0]])) {
    return null
  } else {
    return msgMap[roots[0]]
  }
}
