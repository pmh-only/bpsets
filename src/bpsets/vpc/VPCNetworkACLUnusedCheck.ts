import {
  EC2Client,
  DescribeNetworkAclsCommand,
  DeleteNetworkAclCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class VPCNetworkACLUnusedCheck implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
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

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const aclId of nonCompliantResources) {
      await this.client.send(
        new DeleteNetworkAclCommand({
          NetworkAclId: aclId
        })
      )
    }
  }
}
