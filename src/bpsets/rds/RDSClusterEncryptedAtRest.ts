import { RDSClient, DescribeDBClustersCommand } from '@aws-sdk/client-rds'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSClusterEncryptedAtRest implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSClusterEncryptedAtRest',
    description: 'Ensures that RDS clusters have encryption at rest enabled.',
    priority: 1,
    priorityReason: 'Encryption at rest is critical for data security and compliance.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClustersCommand',
        reason: 'To check the encryption status of RDS clusters.'
      }
    ],
    commandUsedInFixFunction: [],
    adviseBeforeFixFunction:
      'Manually recreate the RDS cluster with encryption at rest enabled, as fixing this requires destructive operations.'
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
    const dbClusters = await this.getDBClusters()

    for (const cluster of dbClusters) {
      if (cluster.StorageEncrypted) {
        compliantResources.push(cluster.DBClusterArn!)
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async () => {
    this.stats.status = 'ERROR'
    this.stats.errorMessage.push({
      date: new Date(),
      message:
        'Fixing encryption at rest requires recreating the cluster. Please manually recreate the cluster with encryption enabled.'
    })
    throw new Error(
      'Fixing encryption at rest requires recreating the cluster. Please manually recreate the cluster with encryption enabled.'
    )
  }

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }
}
