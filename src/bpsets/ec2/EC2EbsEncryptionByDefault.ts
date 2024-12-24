import {
  EC2Client,
  DescribeVolumesCommand,
  EnableEbsEncryptionByDefaultCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2EbsEncryptionByDefault implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const response = await this.memoClient.send(new DescribeVolumesCommand({}))

    for (const volume of response.Volumes || []) {
      if (volume.Encrypted) {
        compliantResources.push(volume.VolumeId!)
      } else {
        nonCompliantResources.push(volume.VolumeId!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async () => {
    await this.client.send(new EnableEbsEncryptionByDefaultCommand({}))
  }
}
