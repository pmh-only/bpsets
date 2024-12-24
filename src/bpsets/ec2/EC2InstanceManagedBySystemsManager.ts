import {
  EC2Client,
  DescribeInstancesCommand
} from '@aws-sdk/client-ec2'
import { SSMClient, DescribeInstanceInformationCommand } from '@aws-sdk/client-ssm'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2InstanceManagedBySystemsManager implements BPSet {
  private readonly client = new EC2Client({})
  private readonly ssmClient = new SSMClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const response = await this.memoClient.send(new DescribeInstancesCommand({}))
    const ssmResponse = await this.ssmClient.send(
      new DescribeInstanceInformationCommand({})
    )

    const managedInstanceIds = ssmResponse.InstanceInformationList?.map(
      info => info.InstanceId
    )

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (managedInstanceIds?.includes(instance.InstanceId!)) {
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

  public readonly fix = async () => {
    throw new Error(
      'Fix logic for EC2InstanceManagedBySystemsManager is not directly applicable. Systems Manager Agent setup requires manual intervention.'
    )
  }
}
