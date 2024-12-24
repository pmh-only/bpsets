import {
  EC2Client,
  DescribeInstancesCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2NoAmazonKeyPair implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const response = await this.memoClient.send(new DescribeInstancesCommand({}))

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.KeyName) {
          nonCompliantResources.push(instance.InstanceId!)
        } else {
          compliantResources.push(instance.InstanceId!)
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async () => {
    throw new Error(
      'Fix logic for EC2NoAmazonKeyPair is not applicable. Key pairs must be removed manually or during instance creation.'
    )
  }
}
