import { EC2Client, DescribeNetworkAclsCommand, DeleteNetworkAclCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class VPCNetworkACLUnusedCheck implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'VPCNetworkACLUnusedCheck',
    description: 'Ensures that unused network ACLs are identified and removed.',
    priority: 2,
    priorityReason: 'Unused network ACLs can clutter the environment and pose a maintenance risk.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeNetworkAclsCommand',
        reason: 'Fetch details of all network ACLs to identify unused ones.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'DeleteNetworkAclCommand',
        reason: 'Delete network ACLs that are not associated with any resources.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that the identified network ACLs are not required for future configurations before deleting them.'
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

    const response = await this.memoClient.send(new DescribeNetworkAclsCommand({}))
    const networkAcls = response.NetworkAcls || []

    for (const acl of networkAcls) {
      if (!acl.Associations || acl.Associations.length === 0) {
        nonCompliantResources.push(acl.NetworkAclId!)
      } else {
        compliantResources.push(acl.NetworkAclId!)
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
    for (const aclId of nonCompliantResources) {
      await this.client.send(
        new DeleteNetworkAclCommand({
          NetworkAclId: aclId
        })
      )
    }
  }
}
