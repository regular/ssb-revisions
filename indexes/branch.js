const Index = require('ssb-review-level')
 
module.exports = function () {
  return Index(1, function map (kv) {
    console.log('BRANCH MAP', kv)
    const value = kv.value
    let branches = value && value.content && value.content.branch || []
    if (!Array.isArray(branches)) branches = [branches]
    return branches.map(b => [b, kv.key])
  })
}
