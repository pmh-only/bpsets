import {
  EC2Client,
  DescribeInstancesCommand,
  TerminateInstancesCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2StoppedInstance implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const response = await this.memoClient.send(new DescribeInstancesCommand({}))

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.State?.Name === 'stopped') {
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

  public readonly fix = async (nonCompliantResources: string[]) => {
    if (nonCompliantResources.length === 0) {
      return // No stopped instances to terminate
    }

    await this.client.send(
      new TerminateInstancesCommand({
        InstanceIds: nonCompliantResources
      })
    )
  }
}
