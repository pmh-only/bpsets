import { RDSClient, DescribeDBClusterSnapshotsCommand, CopyDBClusterSnapshotCommand } from '@aws-sdk/client-rds'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSSnapshotEncrypted implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSSnapshotEncrypted',
    description: 'Ensures RDS cluster snapshots are encrypted.',
    priority: 1,
    priorityReason: 'Encryption ensures data security and compliance with regulations.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'kms-key-id',
        description: 'KMS key ID to encrypt the snapshot.',
        default: '',
        example: 'arn:aws:kms:region:account-id:key/key-id'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClusterSnapshotsCommand',
        reason: 'Fetches RDS cluster snapshots and their encryption status.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'CopyDBClusterSnapshotCommand',
        reason: 'Copies the snapshot with encryption enabled using the provided KMS key.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that the KMS key is properly configured and accessible.'
  })

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const snapshots = await this.getDBClusterSnapshots()

    for (const snapshot of snapshots) {
      if (snapshot.StorageEncrypted) {
        compliantResources.push(snapshot.DBClusterSnapshotArn!)
      } else {
        nonCompliantResources.push(snapshot.DBClusterSnapshotArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const kmsKeyId = requiredParametersForFix.find((param) => param.name === 'kms-key-id')?.value

    if (!kmsKeyId) {
      throw new Error("Required parameter 'kms-key-id' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const snapshotId = arn.split(':snapshot:')[1]

      await this.client.send(
        new CopyDBClusterSnapshotCommand({
          SourceDBClusterSnapshotIdentifier: arn,
          TargetDBClusterSnapshotIdentifier: `${snapshotId}-encrypted`,
          KmsKeyId: kmsKeyId
        })
      )
    }
  }

  private readonly getDBClusterSnapshots = async () => {
    const response = await this.memoClient.send(new DescribeDBClusterSnapshotsCommand({}))
    return response.DBClusterSnapshots || []
  }
}
