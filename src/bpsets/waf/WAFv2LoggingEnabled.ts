import {
  WAFV2Client,
  ListWebACLsCommand,
  GetLoggingConfigurationCommand,
  PutLoggingConfigurationCommand
} from '@aws-sdk/client-wafv2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class WAFv2LoggingEnabled implements BPSet {
  private readonly regionalClient = new WAFV2Client({})
  private readonly globalClient = new WAFV2Client({ region: 'us-east-1' })
  private readonly memoRegionalClient = Memorizer.memo(this.regionalClient)
  private readonly memoGlobalClient = Memorizer.memo(this.globalClient, 'global')

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'WAFv2LoggingEnabled',
    description: 'Ensures that AWS WAFv2 WebACLs have logging enabled.',
    priority: 2,
    priorityReason: 'Logging is critical for monitoring and auditing web traffic behavior.',
    awsService: 'WAFv2',
    awsServiceCategory: 'Web Application Firewall',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'log-group-arn',
        description: 'The ARN of the CloudWatch Log Group for logging.',
        default: '',
        example: 'arn:aws:logs:us-east-1:123456789012:log-group:example-log-group'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetLoggingConfigurationCommand',
        reason: 'Check if logging is configured for the WebACL.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutLoggingConfigurationCommand',
        reason: 'Enable logging for the WebACL.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the specified log group exists and has the correct permissions to be used by WAFv2.'
  })

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []

    for (const scope of ['REGIONAL', 'CLOUDFRONT'] as const) {
      const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient
      const webACLs = await this.getWebACLs(scope)

      for (const webACL of webACLs) {
        try {
          await client.send(new GetLoggingConfigurationCommand({ ResourceArn: webACL.ARN }))
          compliantResources.push(webACL.ARN!)
        } catch (error: unknown) {
          if ((error as Error).name === 'WAFNonexistentItemException') {
            nonCompliantResources.push(webACL.ARN!)
          } else {
            throw error
          }
        }
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  private readonly getWebACLs = async (scope: 'REGIONAL' | 'CLOUDFRONT') => {
    const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient
    const response = await client.send(new ListWebACLsCommand({ Scope: scope }))
    return response.WebACLs || []
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const logGroupArn = requiredParametersForFix.find((param) => param.name === 'log-group-arn')?.value

    if (!logGroupArn) {
      throw new Error("Required parameter 'log-group-arn' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const client = arn.includes('global') ? this.globalClient : this.regionalClient

      await client.send(
        new PutLoggingConfigurationCommand({
          LoggingConfiguration: {
            ResourceArn: arn,
            LogDestinationConfigs: [logGroupArn]
          }
        })
      )
    }
  }
}
