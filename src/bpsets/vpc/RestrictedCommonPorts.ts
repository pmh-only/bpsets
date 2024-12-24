import {
  EC2Client,
  DescribeSecurityGroupRulesCommand,
  RevokeSecurityGroupIngressCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class RestrictedCommonPorts implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getSecurityGroupRules = async () => {
    const response = await this.memoClient.send(new DescribeSecurityGroupRulesCommand({}))
    return response.SecurityGroupRules || []
  }

  public readonly check = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []

    const commonPorts = [-1, 22, 80, 3306, 3389, 5432, 6379, 11211]
    const rules = await this.getSecurityGroupRules()

    for (const rule of rules) {
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

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
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
