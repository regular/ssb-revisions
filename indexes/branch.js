const FlumeReviewLevel = require('flumereview-level')
 
module.exports = FlumeReviewLevel(8, function map (value, seq, old_value, old_seq) {
    console.log('BRANCH INDEX SEQ', seq, old_seq)
    console.log('branch index values', JSON.stringify({value, old_value}, null, 2))
    return []
})
