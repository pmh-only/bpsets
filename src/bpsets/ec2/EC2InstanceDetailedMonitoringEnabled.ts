import {
  DescribeInstancesCommand,
  EC2Client,
  MonitorInstancesCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2InstanceDetailedMonitoringEnabled implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const response = await this.memoClient.send(new DescribeInstancesCommand({}))

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.Monitoring?.State === 'enabled') {
          compliantResources.push(instance.InstanceId!)
        } else {
          nonCompliantResources.push(instance.InstanceId!)
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
    await this.client.send(
      new MonitorInstancesCommand({
        InstanceIds: nonCompliantResources
      })
    )
  }
}
