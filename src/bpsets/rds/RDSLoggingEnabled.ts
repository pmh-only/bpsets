import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class RDSLoggingEnabled implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const logsForEngine = {
      'aurora-mysql': ['audit', 'error', 'general', 'slowquery'],
      'aurora-postgresql': ['postgresql'],
      'docdb': ['audit', 'profiler']
    }
    const dbClusters = await this.getDBClusters()

    for (const cluster of dbClusters) {
      if (
        JSON.stringify(cluster.EnabledCloudwatchLogsExports || []) ===
        JSON.stringify((logsForEngine as any)[cluster.Engine!] || [])
      ) {
        compliantResources.push(cluster.DBClusterArn!)
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!)
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
      const clusterId = arn.split(':cluster/')[1]
      const logsForEngine = {
        'aurora-mysql': ['audit', 'error', 'general', 'slowquery'],
        'aurora-postgresql': ['postgresql'],
        'docdb': ['audit', 'profiler']
      }

      const dbClusters = await this.getDBClusters()
      const cluster = dbClusters.find(c => c.DBClusterArn === arn)

      if (cluster) {
        const logsToEnable = (logsForEngine as any)[cluster.Engine!]

        await this.client.send(
          new ModifyDBClusterCommand({
            DBClusterIdentifier: clusterId,
            CloudwatchLogsExportConfiguration: { EnableLogTypes: logsToEnable }
          })
        )
      }
    }
  }
}
