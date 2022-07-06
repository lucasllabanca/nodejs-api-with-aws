const AWS = require("aws-sdk");
//const AWSXray = require("aws-xray-sdk-core")
const uuid = require("uuid")

//const xRay = AWSXray.captureAWS(require("aws-sdk"))

//variaveis de ambiente locais e as que sao passadas pela OrdensServicoFunctionStack
const ordensServicoDdb = process.env.ORDENS_SERVICO_DDB
const ordensServicoTopicArn = process.env.ORDENS_SERVICO_TOPIC_ARN
const awsRegion = process.env.awsRegion

AWS.config.update({
    region: awsRegion
})

//preciso criar um cliente do DynamoDB
const clienteDynamo = new AWS.DynamoDB.DocumentClient()
const clienteSns = new AWS.SNS({apiVersion: "2010-03-31"})

//tudo que colocou acima do handler vai ser executado no cold start do api gateway

//event: aqui tah um evento e aqui as informacoes de quem a triggou
//context: informacoes de onde tah executando, info contextuais

exports.handler = async function (event, context) {
    
    console.log(event);

    const rota = event.resource
    const method = event.httpMethod;

    //id da requisicao do api gateway
    const apiRequestId = event.requestContext.requestId;
    const lambdaRequestId = context.awsRequestId; //id dentro da minha infra

    console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`);   

    if (rota === '/ordens-servico') {

        if (method === 'GET') {

            //GET /ordens-servico
            console.log('Obter todas as Ordens de Servico')

            const ordensServico = await obterOrdensServico()
            
            return {
                statusCode: 200,
                body: JSON.stringify(ordensServico.Items)
            }

        } else if (method === 'POST') {
            
            //POST /ordens-servico
            console.log('Criar Ordem de Servico')

            const ordemServicoBody = JSON.parse(event.body)

            const ordemServicoCriada = await criarOrdemServico(ordemServicoBody)

            const evento = await enviarEventoOrdemServico(ordemServicoCriada, "OS_CRIADA", lambdaRequestId)

            console.log(`Evento de Ordem de Servico criada enviado - Codigo Unico OS: ${ordemServicoCriada.codigoUnicoOs} - MessageId: ${evento.MessageId}`)

            return {
                statusCode: 201,
                body: JSON.stringify(ordemServicoCriada)
            }

        } 

    } else if (rota === '/ordens-servico/{codigoUnicoOs}') {

        const codigoUnicoOs = event.pathParameters.codigoUnicoOs

        if (method === 'GET') {

            //GET /ordens-servico/{codigoUnicoOs}
            console.log("GET /ordens-servico/{codigoUnicoOs}");

            const ordemServico = await obterOrdemServico(codigoUnicoOs)

            if (ordemServico.Item) {

                return {
                    statusCode: 200,
                    body: JSON.stringify(ordemServico.Item)
                }

            } else {

                return {
                    statusCode: 404,
                    body: JSON.stringify(`Ordem de Servico nao encontrada com codigoUnicoOs: ${codigoUnicoOs}`)
                }

            }

        } else if (method === 'PUT') {

            //PUT /ordens-servico/{codigoUnicoOs}
            console.log("PUT /ordens-servico/{codigoUnicoOs}");

            var ordemServico = await obterOrdemServico(codigoUnicoOs)

            if (ordemServico.Item) {

                const ordemServicoBody = JSON.parse(event.body)

                if (!ordemServicoBody.valor) {
                    ordemServicoBody.valor = ordemServico.Item.valor
                }

                await atualizarOrdemServico(codigoUnicoOs, ordemServicoBody)

                const resultado = await enviarEventoOrdemServico(ordemServicoBody, "OS_ATUALIZADA", lambdaRequestId)

                console.log(`Evento de Ordem de Servico atualizada enviado - Codigo Unico OS: ${codigoUnicoOs} - MessageId: ${resultado.MessageId}`)

                ordemServico = await obterOrdemServico(codigoUnicoOs)

                return {
                    statusCode: 200,
                    body: JSON.stringify(ordemServico.Item)
                }

            } else {

                return {
                    statusCode: 404,
                    body: JSON.stringify(`Ordem de Servico nao encontrada com codigoUnicoOs: ${codigoUnicoOs}`)
                }

            }

        } else if (method === 'DELETE') {

            //DELETE /ordens-servico/{codigoUnicoOs}
            console.log('Apagar uma Ordem de Servico')

            const ordemServicoApagada = await apagarOrdemServico(codigoUnicoOs)

            if (ordemServicoApagada.Attributes) {

                const resultado = await enviarEventoOrdemServico(ordemServicoApagada.Attributes, "OS_APAGADA", lambdaRequestId)

                console.log(`Evento de Ordem de Servico apagada enviado - Codigo Unico OS: ${codigoUnicoOs} - MessageId: ${resultado.MessageId}`)

                return {
                    statusCode: 200,
                    body: JSON.stringify(ordemServicoApagada.Attributes)
                }

            } else {

                return {
                    statusCode: 404,
                    body: JSON.stringify(`Ordem de Servico nao encontrada com codigoUnicoOs: ${codigoUnicoOs}`)
                }

            }
        }

    }

    return {
        statusCode: 400,
        body: JSON.stringify('Bad request')
    }

}

function obterOrdensServico() {

    const params = { TableName: ordensServicoDdb }

    return clienteDynamo.scan(params).promise()

}

function obterOrdemServico(codigoUnicoOs) {
    
    const params = {
        TableName: ordensServicoDdb,
        Key: {
            codigoUnicoOs: codigoUnicoOs
        }
    }
   
    return clienteDynamo.get(params).promise()
}

async function criarOrdemServico(ordemServico) {

    const ordemServicoItem = {
        codigoUnicoOs: uuid.v4(),
        codigoOs: ordemServico.codigoOs,
        estabelecimento: ordemServico.estabelecimento,
        dataAtualizacao: Date.now(),
        placaVeiculo: ordemServico.placaVeiculo,
        valor: ordemServico.valor
    }

    const parametros = {
        TableName: ordensServicoDdb,
        Item: ordemServicoItem
    }

    await clienteDynamo.put(parametros).promise()

    return ordemServicoItem

}

function atualizarOrdemServico(codigoUnicoOs, ordemServico) {

    const params = {
        TableName: ordensServicoDdb,
        Key: {
            codigoUnicoOs: codigoUnicoOs
        },
        UpdateExpression: "set codigoOs = :c, estabelecimento = :e, dataAtualizacao = :d, placaVeiculo = :p, valor = :v",
        ExpressionAttributeValues: {
            ":c": ordemServico.codigoOs,
            ":e": ordemServico.estabelecimento,
            ":d": Date.now(),
            ":p": ordemServico.placaVeiculo,
            ":v": ordemServico.valor
        }         
    }

    return clienteDynamo.update(params).promise()

}

function apagarOrdemServico(codigoUnicoOs) {

    const params = {
        TableName: ordensServicoDdb,
        Key: {
            codigoUnicoOs: codigoUnicoOs
        },
        ReturnValues: "ALL_OLD"
    }

    return clienteDynamo.delete(params).promise()

}

function enviarEventoOrdemServico(ordemServico, eventType, lambdaRequestId) {
    
    const ordemServicoEvento = {
        codigoOs: ordemServico.codigoOs,
        codigoEstabelecimento: ordemServico.codigoEstabelecimento,
        placaVeiculo: ordemServico.placaVeiculo,
        valor: ordemServico.valor,
        requestId: lambdaRequestId
    }

    const envelope = {
        eventType: eventType,
        data: JSON.stringify(ordemServicoEvento)
    }

    const params = {
        Message: JSON.stringify(envelope),
        TopicArn: ordensServicoTopicArn,
        MessageAttributes: {
            eventType: {
                DataType: "String",
                StringValue: eventType
            }
        }
    }

    return clienteSns.publish(params).promise()

}
