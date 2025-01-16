import { RDSClient, DescribeDBClustersCommand, ModifyDBClusterCommand } from '@aws-sdk/client-rds'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSLoggingEnabled implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSLoggingEnabled',
    description: 'Ensures that logging is enabled for RDS clusters.',
    priority: 1,
    priorityReason: 'Enabling logs ensures visibility into database activities for security and troubleshooting.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Monitoring',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClustersCommand',
        reason: 'Fetches the list of RDS clusters and their logging configurations.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBClusterCommand',
        reason: 'Enables CloudWatch logging for non-compliant RDS clusters.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that enabling logs does not negatively impact application performance.'
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
    const logsForEngine: Record<string, string[]> = {
      'aurora-mysql': ['audit', 'error', 'general', 'slowquery'],
      'aurora-postgresql': ['postgresql'],
      docdb: ['audit', 'profiler'],
      mysql: ['audit', 'error', 'general', 'slowquery'],
      postgresql: ['postgresql', 'upgrade']
    }

    const dbClusters = await this.getDBClusters()

    for (const cluster of dbClusters) {
      const requiredLogs = logsForEngine[cluster.Engine!] || []
      const enabledLogs = cluster.EnabledCloudwatchLogsExports || []

      if (JSON.stringify(enabledLogs) === JSON.stringify(requiredLogs)) {
        compliantResources.push(cluster.DBClusterArn!)
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!)
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

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    const logsForEngine: Record<string, string[]> = {
      'aurora-mysql': ['audit', 'error', 'general', 'slowquery'],
      'aurora-postgresql': ['postgresql'],
      docdb: ['audit', 'profiler']
    }

    const dbClusters = await this.getDBClusters()

    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster/')[1]
      const cluster = dbClusters.find((c) => c.DBClusterArn === arn)

      if (cluster) {
        const logsToEnable = logsForEngine[cluster.Engine!] || []

        await this.client.send(
          new ModifyDBClusterCommand({
            DBClusterIdentifier: clusterId,
            CloudwatchLogsExportConfiguration: { EnableLogTypes: logsToEnable }
          })
        )
      }
    }
  }

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }
}
