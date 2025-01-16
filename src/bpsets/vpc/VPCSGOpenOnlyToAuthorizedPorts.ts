import { EC2Client, DescribeSecurityGroupRulesCommand, RevokeSecurityGroupIngressCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class VPCSGOpenOnlyToAuthorizedPorts implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'VPCSGOpenOnlyToAuthorizedPorts',
    description: 'Ensures that security group rules do not allow unrestricted access to unauthorized ports.',
    priority: 3,
    priorityReason: 'Restricting open access to unauthorized ports is crucial for minimizing the attack surface.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeSecurityGroupRulesCommand',
        reason: 'Retrieve all security group rules for analysis.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RevokeSecurityGroupIngressCommand',
        reason: 'Revoke ingress rules that allow open access to unauthorized ports.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that the removal of these rules does not impact legitimate network traffic.'
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
    const authorizedPorts = [80, 443] // Example authorized ports

    const rules = await this.memoClient
      .send(new DescribeSecurityGroupRulesCommand({}))
      .then((response) => response.SecurityGroupRules || [])

    for (const rule of rules) {
      if (
        !rule.IsEgress &&
        (rule.CidrIpv4 === '0.0.0.0/0' || rule.CidrIpv6 === '::/0') &&
        !authorizedPorts.includes(rule.FromPort!) &&
        !authorizedPorts.includes(rule.ToPort!)
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
