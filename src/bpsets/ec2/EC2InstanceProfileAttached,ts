import {
  EC2Client,
  DescribeInstancesCommand,
  AssociateIamInstanceProfileCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class EC2InstanceProfileAttached implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const response = await this.memoClient.send(new DescribeInstancesCommand({}))

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.IamInstanceProfile) {
          compliantResources.push(instance.InstanceId!)
        } else {
          nonCompliantResources.push(instance.InstanceId!)
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'iam-instance-profile' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const iamInstanceProfile = requiredParametersForFix.find(
      param => param.name === 'iam-instance-profile'
    )?.value

    if (!iamInstanceProfile) {
      throw new Error("Required parameter 'iam-instance-profile' is missing.")
    }

    for (const instanceId of nonCompliantResources) {
      await this.client.send(
        new AssociateIamInstanceProfileCommand({
          InstanceId: instanceId,
          IamInstanceProfile: { Name: iamInstanceProfile }
        })
      )
    }
  }
}
