const FlumeviewLevel = require('flumereview-level')
 
module.exports = FlumeviewLevel(5, function map (value, seq, old_value, old_seq) {
    console.log(seq, old_seq)
    //console.log('branch index', JSON.stringify({value, old_value}, null, 2))
    return []
})
