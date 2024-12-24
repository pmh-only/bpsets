import {
  EFSClient,
  DescribeFileSystemsCommand,
  CreateFileSystemCommand,
  DeleteFileSystemCommand
} from '@aws-sdk/client-efs'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EFSEncryptedCheck implements BPSet {
  private readonly client = new EFSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getFileSystems = async () => {
    const response = await this.memoClient.send(new DescribeFileSystemsCommand({}))
    return response.FileSystems || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const fileSystems = await this.getFileSystems()

    for (const fileSystem of fileSystems) {
      if (fileSystem.Encrypted) {
        compliantResources.push(fileSystem.FileSystemArn!)
      } else {
        nonCompliantResources.push(fileSystem.FileSystemArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const fileSystemId = arn.split('/').pop()!
      const fileSystem = await this.memoClient.send(
        new DescribeFileSystemsCommand({ FileSystemId: fileSystemId })
      )

      // Delete the non-compliant file system
      await this.client.send(
        new DeleteFileSystemCommand({
          FileSystemId: fileSystemId
        })
      )

      // Recreate the file system with encryption enabled
      await this.client.send(
        new CreateFileSystemCommand({
          Encrypted: true,
          PerformanceMode: fileSystem.FileSystems?.[0]?.PerformanceMode,
          ThroughputMode: fileSystem.FileSystems?.[0]?.ThroughputMode,
          ProvisionedThroughputInMibps: fileSystem.FileSystems?.[0]?.ProvisionedThroughputInMibps
        })
      )
    }
  }
}
