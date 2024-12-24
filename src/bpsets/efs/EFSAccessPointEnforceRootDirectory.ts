import {
  EFSClient,
  DescribeAccessPointsCommand,
  DeleteAccessPointCommand,
  CreateAccessPointCommand
} from '@aws-sdk/client-efs'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EFSAccessPointEnforceRootDirectory implements BPSet {
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
      if (accessPoint.RootDirectory?.Path !== '/') {
        compliantResources.push(accessPoint.AccessPointArn!)
      } else {
        nonCompliantResources.push(accessPoint.AccessPointArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'root-directory-path' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const rootDirectoryPath = requiredParametersForFix.find(
      param => param.name === 'root-directory-path'
    )?.value

    if (!rootDirectoryPath) {
      throw new Error("Required parameter 'root-directory-path' is missing.")
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

      // Recreate the access point with the desired root directory
      await this.client.send(
        new CreateAccessPointCommand({
          FileSystemId: fileSystemId,
          RootDirectory: { Path: rootDirectoryPath }
        })
      )
    }
  }
}
