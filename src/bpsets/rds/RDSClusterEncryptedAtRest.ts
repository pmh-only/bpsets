import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class RDSClusterEncryptedAtRest implements BPSet {
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
      if (cluster.StorageEncrypted) {
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
    throw new Error(
      'Fixing encryption at rest requires recreating the cluster. Please manually recreate the cluster with encryption enabled.'
    )
  }
}
