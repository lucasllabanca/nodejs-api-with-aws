const AWS = require("aws-sdk");

exports.handler = async function (event, context) {

    //Exceccao de proposito pra testar a DLQ
    //throw 'Non valid event type'

    event.Records.forEach((record) => {
        console.log(record)
        const body = JSON.parse(record.body)
        console.log(body)
    })

    return {}

}
