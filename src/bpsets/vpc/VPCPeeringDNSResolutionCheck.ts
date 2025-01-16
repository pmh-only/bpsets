import {
  EC2Client,
  DescribeVpcPeeringConnectionsCommand,
  ModifyVpcPeeringConnectionOptionsCommand
} from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class VPCPeeringDNSResolutionCheck implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'VPCPeeringDNSResolutionCheck',
    description: 'Ensures that DNS resolution is enabled for all VPC peering connections.',
    priority: 2,
    priorityReason: 'DNS resolution is necessary for seamless communication across VPCs.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Connectivity',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeVpcPeeringConnectionsCommand',
        reason: 'Retrieve details of all VPC peering connections.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyVpcPeeringConnectionOptionsCommand',
        reason: 'Enable DNS resolution for VPC peering connections.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the DNS resolution setting aligns with your network architecture and connectivity needs.'
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

    const response = await this.memoClient.send(new DescribeVpcPeeringConnectionsCommand({}))
    const vpcPeeringConnections = response.VpcPeeringConnections || []

    for (const connection of vpcPeeringConnections) {
      const accepterOptions = connection.AccepterVpcInfo?.PeeringOptions
      const requesterOptions = connection.RequesterVpcInfo?.PeeringOptions

      if (!accepterOptions?.AllowDnsResolutionFromRemoteVpc || !requesterOptions?.AllowDnsResolutionFromRemoteVpc) {
        nonCompliantResources.push(connection.VpcPeeringConnectionId!)
      } else {
        compliantResources.push(connection.VpcPeeringConnectionId!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources)
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

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const connectionId of nonCompliantResources) {
      await this.client.send(
        new ModifyVpcPeeringConnectionOptionsCommand({
          VpcPeeringConnectionId: connectionId,
          AccepterPeeringConnectionOptions: {
            AllowDnsResolutionFromRemoteVpc: true
          },
          RequesterPeeringConnectionOptions: {
            AllowDnsResolutionFromRemoteVpc: true
          }
        })
      )
    }
  }
}
