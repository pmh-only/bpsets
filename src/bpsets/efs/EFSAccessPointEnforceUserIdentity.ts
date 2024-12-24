import {
  EFSClient,
  DescribeAccessPointsCommand,
  DeleteAccessPointCommand,
  CreateAccessPointCommand
} from '@aws-sdk/client-efs'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class EFSAccessPointEnforceUserIdentity implements BPSet {
  private readonly client = new EFSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getAccessPoints = async () => {
    const response = await this.memoClient.send(new DescribeAccessPointsCommand({}))
    return response.AccessPoints || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const accessPoints = await this.getAccessPoints()

    for (const accessPoint of accessPoints) {
      if (accessPoint.PosixUser) {
        compliantResources.push(accessPoint.AccessPointArn!)
      } else {
        nonCompliantResources.push(accessPoint.AccessPointArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'posix-user' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const posixUser = requiredParametersForFix.find(param => param.name === 'posix-user')?.value

    if (!posixUser) {
      throw new Error("Required parameter 'posix-user' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const accessPointId = arn.split('/').pop()!
      const fileSystemId = arn.split(':file-system/')[1].split('/')[0]

      // Delete the existing access point
      await this.client.send(
        new DeleteAccessPointCommand({
          AccessPointId: accessPointId
        })
      )

      // Recreate the access point with the desired PosixUser
      await this.client.send(
        new CreateAccessPointCommand({
          FileSystemId: fileSystemId,
          PosixUser: JSON.parse(posixUser)
        })
      )
    }
  }
}
