import { RDSClient, DescribeDBClustersCommand, ModifyDBClusterCommand } from '@aws-sdk/client-rds'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSClusterAutoMinorVersionUpgradeEnabled implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSClusterAutoMinorVersionUpgradeEnabled',
    description: 'Ensures Auto Minor Version Upgrade is enabled for RDS clusters.',
    priority: 1,
    priorityReason:
      'Auto minor version upgrades help keep the database engine updated with minimal effort, ensuring security and performance improvements.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Configuration Management',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClustersCommand',
        reason: 'Fetch information about RDS clusters to check auto minor version upgrade setting.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBClusterCommand',
        reason: 'Enable auto minor version upgrade for non-compliant RDS clusters.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that enabling auto minor version upgrades aligns with your organization’s change management policies.'
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
      if (cluster.Engine === 'docdb' || cluster.AutoMinorVersionUpgrade) {
        compliantResources.push(cluster.DBClusterArn!)
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    await this.fixImpl(nonCompliantResources)
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

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster/')[1]

      await this.client.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          AutoMinorVersionUpgrade: true
        })
      )
    }
  }

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }
}
