import {
  EFSClient,
  DescribeFileSystemsCommand,
  CreateFileSystemCommand,
  DeleteFileSystemCommand
} from '@aws-sdk/client-efs'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EFSEncryptedCheck implements BPSet {
  private readonly client = new EFSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getFileSystems = async () => {
    const response = await this.memoClient.send(new DescribeFileSystemsCommand({}))
    return response.FileSystems || []
  }

  public readonly getMetadata = () => ({
    name: 'EFSEncryptedCheck',
    description: 'Ensures that all EFS file systems are encrypted.',
    priority: 1,
    priorityReason:
      'Encrypting EFS file systems helps ensure data protection and compliance with security best practices.',
    awsService: 'EFS',
    awsServiceCategory: 'File System',
    bestPracticeCategory: 'Encryption',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeFileSystemsCommand',
        reason: 'Retrieve all existing EFS file systems and their encryption status.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'DeleteFileSystemCommand',
        reason: 'Delete non-compliant EFS file systems.'
      },
      {
        name: 'CreateFileSystemCommand',
        reason: 'Recreate EFS file systems with encryption enabled.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that backups are taken and data migration plans are in place, as the fix involves deletion and recreation of file systems.'
  })

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const fileSystems = await this.getFileSystems()

    for (const fileSystem of fileSystems) {
      if (fileSystem.Encrypted) {
        compliantResources.push(fileSystem.FileSystemArn!)
      } else {
        nonCompliantResources.push(fileSystem.FileSystemArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const fileSystemId = arn.split('/').pop()!
      const fileSystem = await this.memoClient.send(new DescribeFileSystemsCommand({ FileSystemId: fileSystemId }))

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
