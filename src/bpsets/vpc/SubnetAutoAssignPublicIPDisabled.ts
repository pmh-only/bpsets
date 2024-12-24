import {
  EC2Client,
  DescribeSubnetsCommand,
  ModifySubnetAttributeCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SubnetAutoAssignPublicIPDisabled implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []

    const response = await this.memoClient.send(new DescribeSubnetsCommand({}))
    const subnets = response.Subnets || []

    for (const subnet of subnets) {
      if (subnet.MapPublicIpOnLaunch) {
        nonCompliantResources.push(subnet.SubnetId!)
      } else {
        compliantResources.push(subnet.SubnetId!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const subnetId of nonCompliantResources) {
      await this.client.send(
        new ModifySubnetAttributeCommand({
          SubnetId: subnetId,
          MapPublicIpOnLaunch: { Value: false }
        })
      )
    }
  }
}
