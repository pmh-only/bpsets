import { ApiGatewayV2Client, GetApisCommand, GetStagesCommand, UpdateStageCommand } from '@aws-sdk/client-apigatewayv2'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
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

  public readonly getMetadata = () => ({
    name: 'APIGatewayExecutionLoggingEnabled',
    description: 'Ensures that execution logging is enabled for API Gateway stages.',
    priority: 3,
    priorityReason: 'Execution logging is critical for monitoring and troubleshooting API Gateway usage.',
    awsService: 'API Gateway',
    awsServiceCategory: 'API Management',
    bestPracticeCategory: 'Logging and Monitoring',
    requiredParametersForFix: [
      {
        name: 'log-destination-arn',
        description: 'The ARN of the CloudWatch log group for storing API Gateway logs.',
        default: '',
        example: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/apigateway/logs'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetStagesCommand',
        reason: 'Verify if execution logging is enabled for API Gateway stages.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateStageCommand',
        reason: 'Enable execution logging for API Gateway stages and set the destination log group.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the CloudWatch log group exists and has the appropriate permissions.'
  })

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
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

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const logDestinationArn = requiredParametersForFix.find((param) => param.name === 'log-destination-arn')?.value

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
