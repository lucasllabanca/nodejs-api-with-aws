import * as cdk from "@aws-cdk/core";
import * as apigateway from "@aws-cdk/aws-apigateway";
import * as cwlogs from "@aws-cdk/aws-logs";
import * as lambdaNodeJS from "@aws-cdk/aws-lambda-nodejs";

//interface pra conseguir passar varios stack handlers ao mesmo tempo, 
//e nao ficar com 30 parametros
interface FitcardApiStackProps extends cdk.StackProps {
  ordensServicoHandler: lambdaNodeJS.NodejsFunction
}

export class FitcardApiStack extends cdk.Stack {
  public readonly urlOutput: cdk.CfnOutput;

  constructor(scope: cdk.Construct, id: string, props: FitcardApiStackProps) {

    super(scope, id, props);

    const grupoDeLogs = new cwlogs.LogGroup(this, "FitcardApiLogs");

    const api = new apigateway.RestApi(this, "FitcardApi", {
        restApiName: "FitcardApi",
        description: "Fitcard REST API",
        deployOptions: {
            methodOptions: {
                '/*/*': { //todos os resources, dá pra especificar um ou mais
                    throttlingBurstLimit: 4, //num requisicoes simultaneas
                    throttlingRateLimit: 2 //requisicoes por segundo
                }
            },
            accessLogDestination: new apigateway.LogGroupLogDestination(grupoDeLogs),
            accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                caller: true,
                httpMethod: true,
                ip: true,
                protocol: true,
                requestTime: true,
                resourcePath: true,
                responseLength: true,
                status: true,
                user: true,
            }),
        },
    });

    const ordensServicoFunctionIntegration = new apigateway.LambdaIntegration(props.ordensServicoHandler)
    
    const validadorOrdemServico = new apigateway.RequestValidator(this, "ValidadorOrdemServico", {
      restApi: api,
      requestValidatorName: "Validador de campos de uma Ordem de Servico",
      validateRequestBody: true
    })

    const ordemServicoModel = new apigateway.Model(this, "OrdemServicoModel", {
      modelName: "OrdemServicoModel",
      restApi: api,
      contentType: "application/json",
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          codigoOs: {
            type: apigateway.JsonSchemaType.NUMBER
          },
          estabelecimento: {
            type: apigateway.JsonSchemaType.STRING
          },
          placaVeiculo: {
            type: apigateway.JsonSchemaType.STRING
          },
          valor: {
            type: apigateway.JsonSchemaType.NUMBER
          }
          /*,statusOs: {
              type: apigateway.JsonSchemaType.STRING,
              enum: ["AGUARDANDO_COTACAO", "APROVADA", "CANCELADA"]
          }*/
        },
        required: [
          "codigoOs",
          "estabelecimento",
          "placaVeiculo"
        ]
      }
    })

    //resource /ordens-servico
    const ordensServicoResource = api.root.addResource("ordens-servico")

    //GET /ordens-servico
    //GET /ordens-servico?codigoOs=1000
    //GET /ordens-servico?codigoOs=1000&estabelecimento=OFICINA01
    ordensServicoResource.addMethod("GET", ordensServicoFunctionIntegration)

    //POST /ordens-servico
    ordensServicoResource.addMethod("POST", ordensServicoFunctionIntegration, {
      requestValidator: validadorOrdemServico,
      requestModels: {"application/json": ordemServicoModel}
    })

    // /ordens-servico/{codigoUnicoOs}
    const ordensServicoPorCodigoUnicoOsResource = ordensServicoResource.addResource("{codigoUnicoOs}")

    //GET /ordens-servico/{codigoUnicoOs}
    ordensServicoPorCodigoUnicoOsResource.addMethod("GET", ordensServicoFunctionIntegration)

    //PUT /ordens-servico/{codigoUnicoOs}
    ordensServicoPorCodigoUnicoOsResource.addMethod("PUT", ordensServicoFunctionIntegration, {
      requestValidator: validadorOrdemServico,
      requestModels: {"application/json": ordemServicoModel}
    })

    //DELETE /products/{id}
    ordensServicoPorCodigoUnicoOsResource.addMethod("DELETE", ordensServicoFunctionIntegration)

    this.urlOutput = new cdk.CfnOutput(this, "url", {
        exportName: "url",
        value: api.url,
    });
  }
}
