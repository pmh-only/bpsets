import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand
} from '@aws-sdk/client-cloudwatch-logs'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CWLogGroupRetentionPeriodCheck implements BPSet {
  private readonly client = new CloudWatchLogsClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getLogGroups = async () => {
    const response = await this.memoClient.send(new DescribeLogGroupsCommand({}))
    return response.logGroups || []
  }

  public readonly getMetadata = () => ({
    name: 'CWLogGroupRetentionPeriodCheck',
    description: 'Ensures all CloudWatch log groups have a retention period set.',
    priority: 3,
    priorityReason: 'Setting a retention period for log groups helps manage storage costs and compliance.',
    awsService: 'CloudWatch Logs',
    awsServiceCategory: 'Monitoring',
    bestPracticeCategory: 'Configuration',
    requiredParametersForFix: [
      {
        name: 'retention-period-days',
        description: 'Retention period in days to apply to log groups.',
        default: '',
        example: '30'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeLogGroupsCommand',
        reason: 'Retrieve all CloudWatch log groups to verify retention settings.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutRetentionPolicyCommand',
        reason: 'Set the retention period for log groups without a defined retention policy.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the specified retention period meets your organizational compliance requirements.'
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
    const logGroups = await this.getLogGroups()

    for (const logGroup of logGroups) {
      if (logGroup.retentionInDays) {
        compliantResources.push(logGroup.logGroupArn!)
      } else {
        nonCompliantResources.push(logGroup.logGroupArn!)
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
    const retentionPeriod = requiredParametersForFix.find((param) => param.name === 'retention-period-days')?.value

    if (!retentionPeriod) {
      throw new Error("Required parameter 'retention-period-days' is missing.")
    }

    for (const logGroupArn of nonCompliantResources) {
      const logGroupName = logGroupArn.split(':').pop()!
      await this.client.send(
        new PutRetentionPolicyCommand({
          logGroupName,
          retentionInDays: parseInt(retentionPeriod, 10)
        })
      )
    }
  }
}
