import {
  EC2Client,
  DescribeSecurityGroupsCommand,
  RevokeSecurityGroupIngressCommand,
  RevokeSecurityGroupEgressCommand
} from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class VPCDefaultSecurityGroupClosed implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'VPCDefaultSecurityGroupClosed',
    description: 'Ensures that default VPC security groups have no ingress or egress rules.',
    priority: 2,
    priorityReason: 'Default security groups should be closed to enhance network security.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeSecurityGroupsCommand',
        reason: 'Fetch details of default security groups for compliance checks.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RevokeSecurityGroupIngressCommand',
        reason: 'Remove all ingress rules from the default security group.'
      },
      {
        name: 'RevokeSecurityGroupEgressCommand',
        reason: 'Remove all egress rules from the default security group.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure no critical resources depend on default security group rules.'
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

    const response = await this.memoClient.send(
      new DescribeSecurityGroupsCommand({
        Filters: [{ Name: 'group-name', Values: ['default'] }]
      })
    )
    const securityGroups = response.SecurityGroups || []

    for (const group of securityGroups) {
      if (group.IpPermissions?.length || group.IpPermissionsEgress?.length) {
        nonCompliantResources.push(group.GroupId!)
      } else {
        compliantResources.push(group.GroupId!)
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
    for (const groupId of nonCompliantResources) {
      await this.client.send(
        new RevokeSecurityGroupIngressCommand({
          GroupId: groupId,
          IpPermissions: [] // This revokes all ingress rules
        })
      )

      await this.client.send(
        new RevokeSecurityGroupEgressCommand({
          GroupId: groupId,
          IpPermissions: [] // This revokes all egress rules
        })
      )
    }
  }
}
