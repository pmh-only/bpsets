import { EC2Client, DescribeSecurityGroupRulesCommand, RevokeSecurityGroupIngressCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RestrictedCommonPorts implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RestrictedCommonPorts',
    description:
      'Ensures that common ports (e.g., SSH, HTTP, database ports) are not exposed to the public without proper restrictions.',
    priority: 2,
    priorityReason: 'Restricting common ports reduces the risk of unauthorized access to critical services.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeSecurityGroupRulesCommand',
        reason: 'Fetches the list of security group rules to analyze exposure of common ports.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RevokeSecurityGroupIngressCommand',
        reason: 'Revokes ingress rules for non-compliant security group rules.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure there are no dependencies on the removed rules. Revoking these rules may disrupt access to critical services.'
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

    const commonPorts = [-1, 22, 80, 3306, 3389, 5432, 6379, 11211]
    const rules = await this.memoClient.send(new DescribeSecurityGroupRulesCommand({}))
    const securityGroupRules = rules.SecurityGroupRules || []

    for (const rule of securityGroupRules) {
      if (
        !rule.IsEgress &&
        commonPorts.includes(rule.FromPort!) &&
        commonPorts.includes(rule.ToPort!) &&
        !rule.PrefixListId
      ) {
        nonCompliantResources.push(`${rule.GroupId} / ${rule.SecurityGroupRuleId}`)
      } else {
        compliantResources.push(`${rule.GroupId} / ${rule.SecurityGroupRuleId}`)
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
    for (const resource of nonCompliantResources) {
      const [groupId, ruleId] = resource.split(' / ')

      await this.client.send(
        new RevokeSecurityGroupIngressCommand({
          GroupId: groupId,
          SecurityGroupRuleIds: [ruleId]
        })
      )
    }
  }
}
