module.exports = function getStruppedRevs(msgMap) {
  const revisions = Object.values(msgMap)
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
