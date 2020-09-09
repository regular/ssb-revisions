module.exports = function getStruppedRevs(revisions) {
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
