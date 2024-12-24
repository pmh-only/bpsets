import {
  ApiGatewayV2Client,
  GetApisCommand,
  GetStagesCommand,
  UpdateStageCommand
} from '@aws-sdk/client-apigatewayv2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class APIGatewayExecutionLoggingEnabled implements BPSet {
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
        const stageArn = `arn:aws:apigateway:${this.client.config.region}::/apis/${api.ApiId}/stages/${stage.StageName}`
        const loggingLevel = stage.AccessLogSettings?.Format

        if (loggingLevel && loggingLevel !== 'OFF') {
          compliantResources.push(stageArn)
        } else {
          nonCompliantResources.push(stageArn)
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

    for (const stageArn of nonCompliantResources) {
      const [apiId, stageName] = stageArn.split('/').slice(-2)

      await this.client.send(
        new UpdateStageCommand({
          ApiId: apiId,
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
