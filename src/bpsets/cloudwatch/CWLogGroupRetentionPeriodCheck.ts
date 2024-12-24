import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand
} from '@aws-sdk/client-cloudwatch-logs'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CWLogGroupRetentionPeriodCheck implements BPSet {
  private readonly client = new CloudWatchLogsClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getLogGroups = async () => {
    const response = await this.memoClient.send(new DescribeLogGroupsCommand({}))
    return response.logGroups || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const logGroups = await this.getLogGroups()

    for (const logGroup of logGroups) {
      if (logGroup.retentionInDays) {
        compliantResources.push(logGroup.logGroupArn!)
      } else {
        nonCompliantResources.push(logGroup.logGroupArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'retention-period-days' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const retentionPeriod = requiredParametersForFix.find(
      param => param.name === 'retention-period-days'
    )?.value

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
