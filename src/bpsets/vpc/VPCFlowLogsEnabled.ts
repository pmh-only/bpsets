import { EC2Client, DescribeVpcsCommand, DescribeFlowLogsCommand, CreateFlowLogsCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class VPCFlowLogsEnabled implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'VPCFlowLogsEnabled',
    description: 'Ensures that VPC Flow Logs are enabled for all VPCs.',
    priority: 1,
    priorityReason: 'Enabling VPC Flow Logs provides visibility into network traffic for compliance and security.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'log-group-name',
        description: 'The CloudWatch log group where flow logs will be stored.',
        default: '',
        example: '/aws/vpc/flow-logs'
      },
      {
        name: 'iam-role-arn',
        description: 'The IAM role ARN that grants permission to write flow logs to CloudWatch.',
        default: '',
        example: 'arn:aws:iam::123456789012:role/FlowLogsRole'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeFlowLogsCommand',
        reason: 'Fetch existing flow logs to determine VPCs with enabled flow logs.'
      },
      {
        name: 'DescribeVpcsCommand',
        reason: 'Fetch the list of VPCs in the account for comparison.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'CreateFlowLogsCommand',
        reason: 'Enable flow logs for non-compliant VPCs.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the provided log group and IAM role are configured correctly to avoid errors when enabling flow logs.'
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

    const flowLogsResponse = await this.memoClient.send(new DescribeFlowLogsCommand({}))
    const flowLogs = flowLogsResponse.FlowLogs || []
    const flowLogEnabledVpcs = flowLogs.map((log) => log.ResourceId!)

    const vpcsResponse = await this.memoClient.send(new DescribeVpcsCommand({}))
    const vpcs = vpcsResponse.Vpcs || []

    for (const vpc of vpcs) {
      if (flowLogEnabledVpcs.includes(vpc.VpcId!)) {
        compliantResources.push(vpc.VpcId!)
      } else {
        nonCompliantResources.push(vpc.VpcId!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
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
    const logGroupName = requiredParametersForFix.find((param) => param.name === 'log-group-name')?.value
    const iamRoleArn = requiredParametersForFix.find((param) => param.name === 'iam-role-arn')?.value

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
