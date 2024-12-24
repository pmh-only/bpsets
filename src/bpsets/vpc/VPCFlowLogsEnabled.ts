import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeFlowLogsCommand,
  CreateFlowLogsCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class VPCFlowLogsEnabled implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []

    const flowLogsResponse = await this.memoClient.send(new DescribeFlowLogsCommand({}))
    const flowLogs = flowLogsResponse.FlowLogs || []
    const flowLogEnabledVpcs = flowLogs.map(log => log.ResourceId!)

    const vpcsResponse = await this.memoClient.send(new DescribeVpcsCommand({}))
    const vpcs = vpcsResponse.Vpcs || []

    for (const vpc of vpcs) {
      if (flowLogEnabledVpcs.includes(vpc.VpcId!)) {
        compliantResources.push(vpc.VpcId!)
      } else {
        nonCompliantResources.push(vpc.VpcId!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'log-group-name', value: '<LOG_GROUP_NAME>' },
        { name: 'iam-role-arn', value: '<IAM_ROLE_ARN>' }
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const logGroupName = requiredParametersForFix.find(param => param.name === 'log-group-name')?.value
    const iamRoleArn = requiredParametersForFix.find(param => param.name === 'iam-role-arn')?.value

    if (!logGroupName || !iamRoleArn) {
      throw new Error("Required parameters 'log-group-name' and 'iam-role-arn' are missing.")
    }

    for (const vpcId of nonCompliantResources) {
      await this.client.send(
        new CreateFlowLogsCommand({
          ResourceIds: [vpcId],
          ResourceType: 'VPC',
          LogGroupName: logGroupName,
          DeliverLogsPermissionArn: iamRoleArn,
          TrafficType: 'ALL'
        })
      )
    }
  }
}
