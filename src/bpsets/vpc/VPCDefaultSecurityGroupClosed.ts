import {
  EC2Client,
  DescribeSecurityGroupsCommand,
  RevokeSecurityGroupIngressCommand,
  RevokeSecurityGroupEgressCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class VPCDefaultSecurityGroupClosed implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
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

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const groupId of nonCompliantResources) {
      await this.client.send(
        new RevokeSecurityGroupIngressCommand({
          GroupId: groupId,
          IpPermissions: []
        })
      )
      await this.client.send(
        new RevokeSecurityGroupEgressCommand({
          GroupId: groupId,
          IpPermissions: []
        })
      )
    }
  }
}
