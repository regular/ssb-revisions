const Index = require('ssb-review-level')
 
module.exports = function(prop) {
  return Index(3, function map (kv) {
    const {key, value} = kv
    let propValue = value && value.content && value.content[prop] || []
    if (!Array.isArray(propValue)) propValue = [propValue]

    const revisionRoot = (value && value.content && value.content.revisionRoot) || key

    return propValue.map(x => [x, revisionRoot])
  })
}
