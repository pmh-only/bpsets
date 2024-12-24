import {
  DescribeInstancesCommand,
  EC2Client,
  ModifyInstanceMetadataOptionsCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class EC2Imdsv2Check implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const response = await this.memoClient.send(new DescribeInstancesCommand({}))

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.MetadataOptions?.HttpTokens === 'required') {
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
    for (const instanceId of nonCompliantResources) {
      await this.client.send(
        new ModifyInstanceMetadataOptionsCommand({
          InstanceId: instanceId,
          HttpTokens: 'required'
        })
      )
    }
  }
}
