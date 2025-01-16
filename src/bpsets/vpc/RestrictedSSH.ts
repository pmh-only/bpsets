import { EC2Client, DescribeSecurityGroupRulesCommand, RevokeSecurityGroupIngressCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RestrictedSSH implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RestrictedSSH',
    description: 'Ensures SSH (port 22) is not accessible from 0.0.0.0/0 in security groups.',
    priority: 1,
    priorityReason: 'Restricting SSH access reduces the risk of unauthorized access.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeSecurityGroupRulesCommand',
        reason: 'Fetches the list of security group rules to check for unrestricted SSH access.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RevokeSecurityGroupIngressCommand',
        reason: 'Revokes ingress rules for SSH access from 0.0.0.0/0.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure no critical systems depend on the current security group rules allowing unrestricted SSH access.'
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
    const rules = await this.memoClient.send(new DescribeSecurityGroupRulesCommand({}))
    const securityGroupRules = rules.SecurityGroupRules || []

    for (const rule of securityGroupRules) {
      if (!rule.IsEgress && rule.FromPort! <= 22 && rule.ToPort! >= 22 && rule.CidrIpv4 === '0.0.0.0/0') {
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
