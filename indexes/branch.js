const FlumeReviewLevel = require('flumereview-level')
 
module.exports = FlumeReviewLevel(6, function map (value, seq, old_value, old_seq) {
    console.log('BRANCH INDEX', seq, old_seq)
    console.log('branch index', JSON.stringify({value, old_value}, null, 2))
    return []
})
