import {
  EFSClient,
  DescribeFileSystemsCommand,
  PutBackupPolicyCommand,
  DescribeBackupPolicyCommand
} from '@aws-sdk/client-efs'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class EFSAutomaticBackupsEnabled implements BPSet {
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
      const response = await this.client.send(
        new DescribeBackupPolicyCommand({ FileSystemId: fileSystem.FileSystemId! })
      )

      if (response.BackupPolicy?.Status === 'ENABLED') {
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

      await this.client.send(
        new PutBackupPolicyCommand({
          FileSystemId: fileSystemId,
          BackupPolicy: { Status: 'ENABLED' }
        })
      )
    }
  }
}
