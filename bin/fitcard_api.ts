#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { FitcardApiStack } from '../lib/stacks/fitcardApi-stack';
import { OrdensServicoDdbStack } from '../lib/stacks/ordensServicoDdb-stack';
import { OrdensServicoFunctionStack } from '../lib/stacks/ordensServicoFunction-stack';

const app = new cdk.App();

//regiao e num conta do console aws
const environment = {
  region: "us-east-1",
  account: "798038232158"
}

//Tags para usar filtros no aws para as tags
//Daria pra filtrar os gastos da tag Fitcard para todos recursos
const tags = {
  cost: "FitcardApi",
  team: "Sistemas_Externos"
}

const ordensServicoDdbStack = new OrdensServicoDdbStack(app, "OrdensServicoDdb", {
  env: environment,
  tags: tags,
})

const ordensServicoFunctionStack = new OrdensServicoFunctionStack(app, "OrdensServicoFunction", {
  ordensServicoDdb: ordensServicoDdbStack.table,
  env: environment,
  tags: tags
});

ordensServicoFunctionStack.addDependency(ordensServicoDdbStack)

const fitcardApiStack = new FitcardApiStack(app, "FitcardApi", {
  ordensServicoHandler: ordensServicoFunctionStack.ordensServicoHandler,
  env: environment,
  tags: tags
});

//Esteira de pipeline, assim mostra as dependecias pra criar uma antes de outra
fitcardApiStack.addDependency(ordensServicoFunctionStack)
