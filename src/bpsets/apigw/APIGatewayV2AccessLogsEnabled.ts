import {
  ApiGatewayV2Client,
  GetApisCommand,
  GetStagesCommand,
  UpdateStageCommand
} from '@aws-sdk/client-apigatewayv2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class APIGatewayV2AccessLogsEnabled implements BPSet {
  private readonly client = new ApiGatewayV2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getHttpApis = async () => {
    const response = await this.memoClient.send(new GetApisCommand({}))
    return response.Items || []
  }

  private readonly getStages = async (apiId: string) => {
    const response = await this.memoClient.send(new GetStagesCommand({ ApiId: apiId }))
    return response.Items || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const apis = await this.getHttpApis()

    for (const api of apis) {
      const stages = await this.getStages(api.ApiId!)
      for (const stage of stages) {
        const stageIdentifier = `${api.Name!} / ${stage.StageName!}`
        if (!stage.AccessLogSettings) {
          nonCompliantResources.push(stageIdentifier)
        } else {
          compliantResources.push(stageIdentifier)
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'log-destination-arn' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const logDestinationArn = requiredParametersForFix.find(param => param.name === 'log-destination-arn')?.value

    if (!logDestinationArn) {
      throw new Error("Required parameter 'log-destination-arn' is missing.")
    }

    for (const resource of nonCompliantResources) {
      const [apiName, stageName] = resource.split(' / ')
      const api = (await this.getHttpApis()).find(a => a.Name === apiName)

      if (!api) continue

      await this.client.send(
        new UpdateStageCommand({
          ApiId: api.ApiId!,
          StageName: stageName,
          AccessLogSettings: {
            DestinationArn: logDestinationArn,
            Format: '$context.requestId'
          }
        })
      )
    }
  }
}
