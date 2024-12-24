import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class AuroraMySQLBacktrackingEnabled implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const dbClusters = await this.getDBClusters()

    for (const cluster of dbClusters) {
      if (
        cluster.Engine === 'aurora-mysql' &&
        (!cluster.EarliestBacktrackTime || cluster.EarliestBacktrackTime === null)
      ) {
        nonCompliantResources.push(cluster.DBClusterArn!)
      } else {
        compliantResources.push(cluster.DBClusterArn!)
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
      await this.client.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          BacktrackWindow: 3600 // Set backtracking window to 1 hour
        })
      )
    }
  }
}
