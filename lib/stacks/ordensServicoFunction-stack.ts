import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodeJS from "@aws-cdk/aws-lambda-nodejs";
import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb"
import * as sns from "@aws-cdk/aws-sns"
import * as sqs from "@aws-cdk/aws-sqs"
import * as subs from "@aws-cdk/aws-sns-subscriptions"
import * as lambdaEventSource from "@aws-cdk/aws-lambda-event-sources"

interface OrdensServicoFunctionStackProps extends cdk.StackProps {
    ordensServicoDdb: dynamodb.Table
}

export class OrdensServicoFunctionStack extends cdk.Stack {
    readonly ordensServicoHandler: lambdaNodeJS.NodejsFunction //aqui precisa expor pro api gateway 
    
    constructor(scope: cdk.Construct, id: string, props: OrdensServicoFunctionStackProps) {
        super(scope, id, props);        

        //Topico pra publicar msgs e consumir com filas
        const ordensServicoTopic = new sns.Topic(this, "OrdensServicoTopic", {
            topicName: "ordens-servico",
            displayName: "Ordens servico topic"
        })

        //criando handler de Ordens de Servico
        this.ordensServicoHandler = new lambdaNodeJS.NodejsFunction(this, "OrdensServicoFunction", {
            functionName: "OrdensServicoFunction",
            entry: "lambda/ordensServicoFunction.js", //codigo que vai ser executado
            handler: "handler", //nome do metodo que vai ser invocado no arquivo
            memorySize: 128,
            timeout: cdk.Duration.seconds(30),
            tracing: lambda.Tracing.ACTIVE, //habilita a funcao lambda pra gerar servicos do x-ray
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            environment: {
                ORDENS_SERVICO_DDB: props.ordensServicoDdb.tableName, //variavel de ambiente com nome da tbl pra usar na funcao de integracao
                ORDENS_SERVICO_TOPIC_ARN: ordensServicoTopic.topicArn
            },
            bundling: {
                minify: false,
                sourceMap: false,
            }
        })

        //Dando as permissoes ao Handler na tabela de Ordens de Servico e no tópico sns
        props.ordensServicoDdb.grantReadWriteData(this.ordensServicoHandler)
        ordensServicoTopic.grantPublish(this.ordensServicoHandler)

        //Criou a DLQ pra ser usada na fila SQS, a cada 3 tentativas de tratar e der excecao, manda pra DLQ
        const ordensServicoDlq = new sqs.Queue(this, "OrdensServicoDlq", {
            queueName: "ordens-servico-dlq",
            retentionPeriod: cdk.Duration.days(10)     
        })

        //Criou a fila SQS
        const ordensServicoQueue = new sqs.Queue(this, "OrdensServicoQueue", {
            queueName: "ordens-servico",
            deadLetterQueue: {
                queue: ordensServicoDlq,
                maxReceiveCount: 3
            }
        })

        //Inscreveu a fila no Topic e filtrou somente pra OS_CRIADA eventType
        ordensServicoTopic.addSubscription(new subs.SqsSubscription(ordensServicoQueue, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ['OS_CRIADA']
                })
            }
        }))

        //Criou Handler de emails
        const emailsHandler = new lambdaNodeJS.NodejsFunction(this, "EmailsFunction", {
            functionName: "EmailsFunction",
            entry: "lambda/emailsFunction.js",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(30),
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            bundling: {
                minify: false,
                sourceMap: false,
            }
        });

        //A cada 1min vai buscar no maximo 5 msgs do topico sns e traz pro sqs
        emailsHandler.addEventSource(new lambdaEventSource.SqsEventSource(ordensServicoQueue, {
            batchSize: 5,
            maxBatchingWindow: cdk.Duration.minutes(1)    
        }))

        ordensServicoQueue.grantConsumeMessages(emailsHandler)
    }
}
