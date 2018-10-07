const Index = require('ssb-review-level')
 
module.exports = function(prop) {
  return Index(2, function map (kv) {
    const {key, value} = kv
    let propValue = value && value.content && value.content[prop] || []
    if (!Array.isArray(propValue)) propValue = [propValue]
    // reasoning for using message key as second array element:
    // - we must avoid overwriting index entries for different messages, so we need
    // a second array alement. Candidates: timestamp, sequence, key
    // - we want the index to change when the message changes, even if the prperty we look for is unchanged
    // - there might be scenarios, where a messages key is all we need
    return propValue.map(x => [x, key])
  })
}
