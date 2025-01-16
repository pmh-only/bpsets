import {
  EFSClient,
  DescribeAccessPointsCommand,
  DeleteAccessPointCommand,
  CreateAccessPointCommand
} from '@aws-sdk/client-efs'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EFSAccessPointEnforceRootDirectory implements BPSet {
  private readonly client = new EFSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getAccessPoints = async () => {
    const response = await this.memoClient.send(new DescribeAccessPointsCommand({}))
    return response.AccessPoints || []
  }

  public readonly getMetadata = () => ({
    name: 'EFSAccessPointEnforceRootDirectory',
    description: 'Ensures that EFS Access Points enforce a specific root directory.',
    priority: 1,
    priorityReason:
      'Enforcing a consistent root directory path for EFS Access Points ensures proper access control and organization.',
    awsService: 'EFS',
    awsServiceCategory: 'File System',
    bestPracticeCategory: 'Resource Configuration',
    requiredParametersForFix: [
      {
        name: 'root-directory-path',
        description: 'The root directory path to enforce for EFS Access Points.',
        default: '/',
        example: '/data'
      }
    ],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeAccessPointsCommand',
        reason: 'Retrieve all existing EFS Access Points and their configurations.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'DeleteAccessPointCommand',
        reason: 'Delete non-compliant EFS Access Points.'
      },
      {
        name: 'CreateAccessPointCommand',
        reason: 'Recreate EFS Access Points with the enforced root directory.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure no active workloads are using the access points before applying fixes as it involves deletion and recreation.'
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
    const accessPoints = await this.getAccessPoints()

    for (const accessPoint of accessPoints) {
      if (accessPoint.RootDirectory?.Path === '/') {
        compliantResources.push(accessPoint.AccessPointArn!)
      } else {
        nonCompliantResources.push(accessPoint.AccessPointArn!)
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const rootDirectoryPath = requiredParametersForFix.find((param) => param.name === 'root-directory-path')?.value

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
